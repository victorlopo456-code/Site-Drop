import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Loader2, Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/cart";
import { formatBRL } from "@/lib/catalog";
import { toast } from "sonner";
import { quoteShipping } from "@/lib/shipping";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function CartDrawer() {
  const {
    items,
    open,
    setOpen,
    setQty,
    remove,
    subtotal,
    discount,
    coupon,
    applyCoupon,
    recoveryEmail,
    saveRecoveryEmail,
  } = useCart();
  const [code, setCode] = useState("");
  const [cep, setCep] = useState("");
  const [shipping, setShipping] = useState<number | null>(null);
  const [shippingLabel, setShippingLabel] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [email, setEmail] = useState(recoveryEmail);
  useEffect(() => setEmail(recoveryEmail), [recoveryEmail]);

  const total = Math.max(subtotal - discount + (shipping ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-0 border-border bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="font-display uppercase">Seu carrinho</SheetTitle>
          <SheetDescription>
            {items.length === 0
              ? "Nenhum produto adicionado ainda."
              : `${items.length} produto(s) na sacola`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Sua sacola está vazia. Bora escolher um setup?
              </p>
              <Button variant="hero" asChild onClick={() => setOpen(false)}>
                <Link to="/produtos" search={{ q: "", cat: "", marca: "" }}>
                  Ver produtos
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-2.5 rounded-lg border border-border bg-card p-2.5 sm:gap-3 sm:p-3"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    width={80}
                    height={80}
                    className="h-16 w-16 rounded object-cover sm:h-20 sm:w-20"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {item.brand}
                    </p>
                    <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
                    {item.variantLabel && (
                      <p className="text-xs text-primary">{item.variantLabel}</p>
                    )}
                    <p className="mt-1 font-display text-primary">{formatBRL(item.price)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded border border-border">
                        <button
                          aria-label="Diminuir"
                          className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-primary"
                          onClick={() => setQty(item.id, item.qty - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm">{item.qty}</span>
                        <button
                          aria-label="Aumentar"
                          className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-primary"
                          onClick={() => setQty(item.id, item.qty + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        aria-label="Remover"
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        onClick={() => remove(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-3 border-t border-border p-4 sm:p-5">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                placeholder="Cupom (ex: DROP10)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={20}
              />
              <Button
                variant="surface"
                disabled={applyingCoupon}
                onClick={async () => {
                  setApplyingCoupon(true);
                  try {
                    await applyCoupon(code);
                    toast.success("Cupom aplicado!");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Cupom inválido.");
                  } finally {
                    setApplyingCoupon(false);
                  }
                }}
              >
                {applyingCoupon ? <Loader2 className="animate-spin" /> : "Aplicar"}
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                placeholder="CEP para frete"
                value={cep}
                onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
              />
              <Button
                variant="surface"
                disabled={quoting}
                onClick={async () => {
                  if (cep.length !== 8) return toast.error("Informe um CEP válido");
                  const supabase = getSupabaseBrowserClient();
                  const { data } = (await supabase?.auth.getSession()) ?? {
                    data: { session: null },
                  };
                  let visitorId = localStorage.getItem("drop-shipping-visitor");
                  if (!visitorId) {
                    visitorId = crypto.randomUUID();
                    localStorage.setItem("drop-shipping-visitor", visitorId);
                  }
                  setQuoting(true);
                  try {
                    const result = await quoteShipping({
                      data: {
                        accessToken: data.session?.access_token ?? null,
                        visitorId,
                        cep,
                        items: items.map((item) => ({
                          id: item.productId,
                          variantId: item.variantId,
                          qty: item.qty,
                        })),
                      },
                    });
                    const cheapest = [...result.options].sort(
                      (left, right) => left.price - right.price,
                    )[0];
                    if (!cheapest) throw new Error("Nenhuma opção disponível.");
                    setShipping(cheapest.price);
                    setShippingLabel(`${cheapest.label} · até ${cheapest.days} dias úteis`);
                    toast.success(
                      result.live ? "Frete atualizado." : "Estimativa de frete calculada.",
                    );
                  } catch (error) {
                    setShipping(null);
                    setShippingLabel("");
                    toast.error(
                      error instanceof Error ? error.message : "Não foi possível calcular o frete.",
                    );
                  } finally {
                    setQuoting(false);
                  }
                }}
              >
                {quoting ? <Loader2 className="animate-spin" /> : <Truck />}{" "}
                {quoting ? "Calculando" : "Calcular"}
              </Button>
            </div>
            {shippingLabel && (
              <p className="text-xs text-muted-foreground">Menor valor: {shippingLabel}</p>
            )}

            <div className="rounded-md border border-border bg-card p-3">
              <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Bell className="h-3.5 w-3.5 text-primary" />
                Receba um lembrete se deixar esta compra para depois.
              </p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  type="email"
                  placeholder="Seu melhor e-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={320}
                />
                <Button
                  variant="surface"
                  onClick={async () => {
                    if (!/^\S+@\S+\.\S+$/.test(email))
                      return toast.error("Informe um e-mail válido.");
                    await saveRecoveryEmail(email);
                    toast.success("Lembrete de carrinho ativado.");
                  }}
                >
                  Ativar
                </Button>
              </div>
            </div>

            <Separator />

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatBRL(subtotal)}</dd>
              </div>
              {coupon && (
                <div className="flex justify-between text-primary">
                  <dt>Desconto ({coupon})</dt>
                  <dd>-{formatBRL(discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Frete</dt>
                <dd>{shipping === null ? "—" : shipping === 0 ? "Grátis" : formatBRL(shipping)}</dd>
              </div>
              <div className="flex items-center justify-between pt-1">
                <dt className="font-display uppercase">Total</dt>
                <dd className="font-display text-xl text-primary">{formatBRL(total)}</dd>
              </div>
            </dl>

            <Button
              variant="hero"
              size="lg"
              className="w-full"
              asChild
              onClick={() => setOpen(false)}
            >
              <Link to="/checkout">Finalizar compra</Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
