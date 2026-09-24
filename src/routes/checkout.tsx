import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Search, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/cart";
import { formatBRL } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createMercadoPagoCheckout } from "@/lib/mercado-pago";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { quoteShipping, quoteStorePickup, type ShippingOption } from "@/lib/shipping";
import { getAnalyticsAttribution, trackAnalyticsEvent } from "@/lib/analytics";
import { loadAddresses, type CustomerAddress } from "@/lib/customer-account";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — DROP Skate Shop" },
      {
        name: "description",
        content: "Finalize seu pedido com PIX, cartão, boleto ou carteiras digitais.",
      },
      { property: "og:title", content: "Checkout — DROP Skate Shop" },
      { property: "og:description", content: "Checkout rápido e seguro da DROP Skate Shop." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

const steps = ["Identificação", "Endereço", "Entrega", "Pagamento", "Confirmação"];

function formatCpf(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatCep(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return Number(digits[length]) === (remainder === 10 ? 0 : remainder);
  };
  return check(9) && check(10);
}

const formSchema = z.object({
  nome: z.string().trim().min(3, "Informe seu nome completo").max(100),
  email: z.string().trim().email("E-mail inválido").max(255),
  cpf: z.string().trim().refine(isValidCpf, "CPF inválido"),
  cep: z.string().trim().length(8, "CEP deve ter 8 dígitos"),
  endereco: z.string().trim().min(3, "Informe o endereço").max(200),
  numero: z.string().trim().min(1, "Informe o número").max(10),
  cidade: z.string().trim().min(2, "Informe a cidade").max(100),
});

const pickupFormSchema = formSchema.extend({
  cep: z.string().max(9),
  endereco: z.string().max(200),
  numero: z.string().max(10),
  cidade: z.string().max(100),
});

function Checkout() {
  const { items, subtotal, discount, coupon } = useCart();
  const [step, setStep] = useState(0);
  const [shipping, setShipping] = useState<ShippingOption | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [shippingMessage, setShippingMessage] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [selectingPickup, setSelectingPickup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    cpf: "",
    cep: "",
    endereco: "",
    numero: "",
    cidade: "",
  });

  const shippingPrice = shipping?.price ?? 0;
  const total = Math.max(subtotal - discount + shippingPrice, 0);

  useEffect(() => {
    if (items.length) trackAnalyticsEvent("begin_checkout");
  }, [items.length]);

  useEffect(() => {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      setLookingUpCep(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLookingUpCep(true);
      void fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Falha ao consultar o CEP.");
          return (await response.json()) as {
            erro?: boolean;
            logradouro?: string;
            bairro?: string;
            localidade?: string;
            uf?: string;
          };
        })
        .then((address) => {
          if (address.erro) {
            toast.error("CEP não encontrado.");
            return;
          }
          setForm((current) => {
            if (current.cep.replace(/\D/g, "") !== cep) return current;
            return {
              ...current,
              endereco:
                [address.logradouro, address.bairro].filter(Boolean).join(" - ") ||
                current.endereco,
              cidade:
                address.localidade && address.uf
                  ? `${address.localidade}/${address.uf}`
                  : current.cidade,
            };
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          toast.error("Não foi possível consultar o CEP agora.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLookingUpCep(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.cep]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadingCustomer(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user || !active) return;
        const [{ data: profile }, addresses] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle(),
          loadAddresses(),
        ]);
        if (!active) return;
        setSavedAddresses(addresses);
        const preferred = addresses.find((address) => address.is_default) ?? addresses[0];
        setForm((current) => ({
          ...current,
          nome:
            current.nome ||
            preferred?.recipient ||
            profile?.full_name ||
            (typeof auth.user.user_metadata.full_name === "string"
              ? auth.user.user_metadata.full_name
              : ""),
          email: current.email || auth.user.email || "",
          cep: current.cep || (preferred ? formatCep(preferred.postal_code) : ""),
          endereco:
            current.endereco ||
            (preferred
              ? [preferred.street, preferred.neighborhood].filter(Boolean).join(" - ")
              : ""),
          numero: current.numero || preferred?.number || "",
          cidade:
            current.cidade ||
            (preferred ? [preferred.city, preferred.state].filter(Boolean).join("/") : ""),
        }));
      } catch {
        /* O checkout continua disponível para preenchimento manual. */
      } finally {
        if (active) setLoadingCustomer(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const applyAddress = (address: CustomerAddress) => {
    setForm((current) => ({
      ...current,
      nome: address.recipient || current.nome,
      cep: formatCep(address.postal_code),
      endereco: [address.street, address.neighborhood].filter(Boolean).join(" - "),
      numero: address.number,
      cidade: [address.city, address.state].filter(Boolean).join("/"),
    }));
    setShipping(null);
    setShippingOptions([]);
    setStep(1);
  };

  const calculateShipping = async () => {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length !== 8) return toast.error("Informe um CEP válido.");
    const supabase = getSupabaseBrowserClient();
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    if (!data.session) return toast.error("Entre na sua conta para calcular o frete.");
    setQuoting(true);
    try {
      const [addressResponse, quote] = await Promise.all([
        fetch(`https://viacep.com.br/ws/${cep}/json/`).then((response) =>
          response.json(),
        ) as Promise<{
          erro?: boolean;
          logradouro?: string;
          localidade?: string;
          uf?: string;
        }>,
        quoteShipping({
          data: {
            accessToken: data.session.access_token,
            cep,
            items: items.map((item) => ({
              id: item.productId,
              variantId: item.variantId,
              qty: item.qty,
            })),
          },
        }),
      ]);
      if (!addressResponse.erro) {
        setForm((current) => ({
          ...current,
          endereco: addressResponse.logradouro || current.endereco,
          cidade:
            addressResponse.localidade && addressResponse.uf
              ? `${addressResponse.localidade}/${addressResponse.uf}`
              : current.cidade,
        }));
      }
      setShippingOptions(quote.options);
      setShipping(quote.options[0] ?? null);
      setShippingMessage(quote.message);
      setStep(2);
    } catch (error) {
      setShippingOptions([]);
      setShipping(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível calcular o frete.");
    } finally {
      setQuoting(false);
    }
  };

  const selectStorePickup = async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    if (!data.session) return toast.error("Entre na sua conta para escolher a retirada.");
    setSelectingPickup(true);
    try {
      const option = await quoteStorePickup({
        data: {
          accessToken: data.session.access_token,
          items: items.map((item) => ({
            id: item.productId,
            variantId: item.variantId,
            qty: item.qty,
          })),
        },
      });
      setShipping(option);
      setShippingMessage("Retirada gratuita. Combinaremos os detalhes após a confirmação.");
      setStep(2);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível escolher a retirada.");
    } finally {
      setSelectingPickup(false);
    }
  };

  const finish = async () => {
    if (!shipping) {
      toast.error("Calcule e escolha uma opção de frete.");
      return;
    }
    const parsed = (shipping.id === "store-pickup" ? pickupFormSchema : formSchema).safeParse({
      ...form,
      cpf: form.cpf.replace(/\D/g, ""),
      cep: form.cep.replace(/\D/g, ""),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = (await supabase?.auth.getSession()) ?? {
      data: { session: null },
    };
    if (!sessionData.session) {
      toast.error("Entre na sua conta antes de finalizar a compra.");
      return;
    }
    setSubmitting(true);
    try {
      const checkout = await createMercadoPagoCheckout({
        data: {
          accessToken: sessionData.session.access_token,
          items: items.map((item) => ({
            id: item.productId,
            variantId: item.variantId,
            qty: item.qty,
          })),
          coupon,
          shippingQuote: shipping.token,
          buyer: parsed.data,
          analytics: getAnalyticsAttribution(),
        },
      });
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível abrir o Mercado Pago.",
      );
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container-drop py-24 text-center">
        <h1 className="text-3xl uppercase">Seu carrinho está vazio</h1>
        <Button variant="hero" size="lg" className="mt-6" asChild>
          <Link to="/produtos" search={{ q: "", cat: "", marca: "" }}>
            Escolher produtos
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container-drop py-7 sm:py-12">
      <h1 className="text-3xl uppercase md:text-4xl">Checkout</h1>

      <p className="mt-4 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-4 text-sm text-muted-foreground">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" /> O pagamento é processado com
        segurança no ambiente do Mercado Pago.
      </p>

      <ol className="mt-6 flex flex-wrap gap-2 text-xs uppercase tracking-widest">
        {steps.map((s, i) => (
          <li
            key={s}
            className={cn(
              "rounded border px-3 py-1.5",
              i <= step ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="font-display text-lg uppercase">1. Identificação</h2>
            {loadingCustomer && (
              <p className="mt-2 text-xs text-muted-foreground">Carregando dados da sua conta…</p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={set("nome")}
                  maxLength={100}
                  onFocus={() => setStep(0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={form.cpf}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))
                  }
                  maxLength={14}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  maxLength={255}
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="font-display text-lg uppercase">2. Endereço</h2>
            {savedAddresses.length > 0 && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Usar endereço salvo
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {savedAddresses.map((address) => (
                    <Button
                      key={address.id}
                      type="button"
                      variant="surface"
                      size="sm"
                      onClick={() => applyAddress(address)}
                    >
                      {address.label}
                      {address.is_default ? " · Principal" : ""}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <div className="flex gap-2">
                  <Input
                    id="cep"
                    value={form.cep}
                    onChange={(event) => {
                      const cep = formatCep(event.target.value);
                      setForm((current) => ({
                        ...current,
                        cep,
                        endereco: cep !== current.cep ? "" : current.endereco,
                        cidade: cep !== current.cep ? "" : current.cidade,
                      }));
                      setShipping(null);
                      setShippingOptions([]);
                    }}
                    maxLength={9}
                    inputMode="numeric"
                    onFocus={() => setStep(1)}
                  />
                  <Button
                    type="button"
                    variant="surface"
                    size="icon"
                    disabled={quoting || lookingUpCep}
                    onClick={() => void calculateShipping()}
                    aria-label="Buscar CEP e calcular frete"
                  >
                    {quoting || lookingUpCep ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  value={form.endereco}
                  onChange={set("endereco")}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input id="numero" value={form.numero} onChange={set("numero")} maxLength={10} />
              </div>
              <div className="space-y-2 sm:col-span-4">
                <Label htmlFor="cidade">Cidade / UF</Label>
                <Input id="cidade" value={form.cidade} onChange={set("cidade")} maxLength={100} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="font-display text-lg uppercase">3. Entrega</h2>
            <button
              type="button"
              disabled={selectingPickup}
              onClick={() => void selectStorePickup()}
              className={cn(
                "mt-4 flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors",
                shipping?.id === "store-pickup"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/60",
              )}
            >
              <span>
                <strong className="block">Retirar na loja</strong>
                <span className="text-xs text-muted-foreground">
                  Sem frete · detalhes após a confirmação
                </span>
              </span>
              {selectingPickup ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <strong className="text-primary">Grátis</strong>
              )}
            </button>
            <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
              Ou receba no seu endereço
            </p>
            <Button
              type="button"
              variant="surface"
              className="mt-4"
              disabled={quoting}
              onClick={() => void calculateShipping()}
            >
              {quoting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {quoting ? "Calculando…" : "Calcular pelo CEP"}
            </Button>
            {shippingMessage && (
              <p className="mt-3 text-xs text-muted-foreground">{shippingMessage}</p>
            )}
            <div className="mt-4 space-y-2">
              {shippingOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setShipping(opt);
                    setStep(2);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors",
                    shipping?.id === opt.id
                      ? "border-primary"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <span>
                    <span className="block font-medium">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      Até {opt.days} dias úteis
                    </span>
                  </span>
                  <span className="font-display text-primary">
                    {opt.price === 0 ? "Grátis" : formatBRL(opt.price)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="font-display text-lg uppercase">4. Pagamento</h2>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="mt-4 flex w-full items-center gap-3 rounded-md border border-primary px-4 py-3 text-left text-sm text-primary"
            >
              <ExternalLink className="h-4 w-4" /> Escolha PIX, cartão ou boleto no Mercado Pago
            </button>
          </section>
        </div>

        <aside className="h-fit rounded-lg border border-border bg-card p-4 sm:p-6 lg:sticky lg:top-40">
          <h2 className="font-display text-lg uppercase">Resumo do pedido</h2>
          <ul className="mt-4 space-y-3">
            {items.map((i) => (
              <li key={i.id} className="flex gap-3 text-sm">
                <img
                  src={i.image}
                  alt={i.name}
                  loading="lazy"
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 block">{i.name}</span>
                  {i.variantLabel && (
                    <span className="block text-xs text-primary">{i.variantLabel}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">Qtd: {i.qty}</span>
                </span>
                <span>{formatBRL(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>

          <Separator className="my-4" />

          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatBRL(subtotal)}</dd>
            </div>
            {coupon && (
              <div className="flex justify-between text-primary">
                <dt>Cupom {coupon}</dt>
                <dd>-{formatBRL(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Frete</dt>
              <dd>
                {!shipping
                  ? "Calcule o frete"
                  : shippingPrice === 0
                    ? "Grátis"
                    : formatBRL(shippingPrice)}
              </dd>
            </div>
            <div className="flex items-center justify-between pt-2">
              <dt className="font-display uppercase">Total</dt>
              <dd className="font-display text-2xl text-primary">{formatBRL(total)}</dd>
            </div>
          </dl>

          <Button
            variant="hero"
            size="lg"
            className="mt-6 w-full"
            disabled={submitting}
            onClick={finish}
          >
            {submitting ? "Abrindo Mercado Pago…" : "Pagar com Mercado Pago"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Você será redirecionado para concluir o pagamento
          </p>
          <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">
            Ao continuar, você declara que leu os{" "}
            <Link to="/termos-de-uso" className="text-primary hover:underline">
              Termos de uso
            </Link>{" "}
            e a{" "}
            <Link to="/politica-de-privacidade" className="text-primary hover:underline">
              Política de privacidade
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
