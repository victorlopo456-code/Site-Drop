import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  CreditCard,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  PackageSearch,
  Search,
  Send,
  ShoppingBag,
  ThumbsDown,
  ThumbsUp,
  Truck,
  X,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, isOutOfStock, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { getFulfillmentLabel, loadCustomerOrders } from "@/lib/order-management";
import { smartSearchProducts } from "@/lib/product-search";
import { quoteShipping } from "@/lib/shipping";
import {
  defaultSiteSettings,
  loadSiteSettings,
  whatsappUrl,
  type SiteSettings,
} from "@/lib/site-settings";
import { getSupabaseBrowserClient, useCurrentUserName } from "@/lib/supabase";
import { useProducts } from "@/lib/store";

type ChatMessage = {
  id: string;
  role: "bot" | "user";
  text: string;
  products?: Product[];
  action?: { label: string; path: "/conta" | "/entrar" | "/checkout" | "/produtos" };
};

const quickOptions = [
  { label: "Buscar produto", icon: Search, prompt: "Quero buscar um produto" },
  { label: "Calcular frete", icon: Truck, prompt: "Quero calcular o frete" },
  { label: "Meu pedido", icon: PackageSearch, prompt: "Onde está meu pedido?" },
  { label: "Meu carrinho", icon: ShoppingBag, prompt: "O que tem no meu carrinho?" },
  { label: "Retirada", icon: MapPin, prompt: "Como funciona a retirada na loja?" },
  { label: "Pagamento", icon: CreditCard, prompt: "Quais são as formas de pagamento?" },
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function supportUrl(phone: string, message: string) {
  return `${whatsappUrl(phone)}?text=${encodeURIComponent(message)}`;
}

function createMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: crypto.randomUUID(), role, text };
}

export function VirtualAssistant() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const products = useProducts();
  const userName = useCurrentUserName();
  const { items, count, subtotal, setOpen: setCartOpen } = useCart();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [rated, setRated] = useState<"yes" | "no" | null>(null);
  const [settings, setSettings] = useState(defaultSiteSettings);
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "bot",
      "Olá! 👋 Eu sou o DropBot. Digite sua dúvida ou escolha uma opção abaixo.",
    ),
  ]);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void loadSiteSettings().then((loaded) => active && setSettings(loaded));
    const update = (event: Event) =>
      setSettings((event as CustomEvent<SiteSettings>).detail ?? defaultSiteSettings);
    window.addEventListener("drop-site-settings-updated", update);
    return () => {
      active = false;
      window.removeEventListener("drop-site-settings-updated", update);
    };
  }, []);

  useEffect(() => {
    if (open) messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, typing]);

  const contextHint = useMemo(() => {
    if (pathname.startsWith("/produto/"))
      return "Posso ajudar com tamanho, estoque ou frete deste produto.";
    if (pathname === "/checkout")
      return "Posso ajudar com endereço, entrega, retirada ou pagamento.";
    if (pathname === "/conta")
      return "Posso consultar o status do seu pedido ou explicar rastreio e trocas.";
    return null;
  }, [pathname]);
  const contextProduct = pathname.startsWith("/produto/")
    ? products.find((product) => product.slug === pathname.split("/produto/")[1])
    : undefined;

  if (pathname.startsWith("/admin")) return null;

  const addBot = (message: Omit<ChatMessage, "id" | "role">) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "bot", ...message }]);
  };

  const openWhatsApp = (history = messages) => {
    const conversation = history
      .slice(-6)
      .map((message) => `${message.role === "user" ? "Cliente" : "DropBot"}: ${message.text}`)
      .join("\n");
    window.open(
      supportUrl(
        settings.phone,
        `Olá! Vim pelo DropBot e preciso de ajuda.\nPágina: ${window.location.href}\n\n${conversation}`,
      ),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const calculateFreight = async (cep: string) => {
    if (!items.length) {
      addBot({
        text: "Seu carrinho está vazio. Adicione um produto e depois envie o CEP para calcularmos o frete.",
        action: { label: "Ver produtos", path: "/produtos" },
      });
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    let visitorId = localStorage.getItem("drop-shipping-visitor");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("drop-shipping-visitor", visitorId);
    }
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
    const options = [...result.options].sort((left, right) => left.price - right.price);
    addBot({
      text: options.length
        ? `Para o CEP ${cep.slice(0, 5)}-${cep.slice(5)}: ${options
            .slice(0, 3)
            .map(
              (option) =>
                `${option.label}: ${option.price ? formatBRL(option.price) : "grátis"}, até ${option.days} dias úteis`,
            )
            .join(" • ")}.`
        : "Não encontrei uma opção de entrega para esse CEP.",
      action: { label: "Ir para o checkout", path: "/checkout" },
    });
  };

  const findProducts = (query: string) => {
    const cleaned = normalize(query)
      .replace(
        /\b(quero|buscar|procuro|produto|produtos|tem|voces|voce|uma|um|de|da|do|para|comprar|encontrar)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
    const result = cleaned ? smartSearchProducts(products, cleaned, 3) : [];
    addBot(
      result.length
        ? {
            text: `Encontrei ${result.length} opção${result.length > 1 ? "ões" : ""} para você:`,
            products: result,
          }
        : {
            text: cleaned
              ? `Não encontrei “${cleaned}” no catálogo. Tente informar marca, categoria, nome ou SKU.`
              : "Digite o nome, marca, categoria ou SKU. Por exemplo: “Vans”, “camiseta” ou “DRP-0025”.",
            action: { label: "Ver todo o catálogo", path: "/produtos" },
          },
    );
  };

  const answerOrder = async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    if (!data.user) {
      addBot({
        text: "Entre na sua conta para eu consultar seus pedidos com segurança.",
        action: { label: "Entrar na conta", path: "/entrar" },
      });
      return;
    }
    const order = (await loadCustomerOrders())[0];
    if (!order) {
      addBot({ text: "Não encontrei pedidos nesta conta." });
      return;
    }
    const status = getFulfillmentLabel(order.fulfillment_status, order.shipping_method);
    const tracking = order.tracking_code
      ? ` O rastreio é ${order.tracking_code}${order.carrier ? ` (${order.carrier})` : ""}.`
      : " Ainda não há código de rastreio.";
    addBot({
      text: `Seu pedido mais recente é o #DRP${order.order_number}. Status: ${status}.${tracking}`,
      action: { label: "Ver meus pedidos", path: "/conta" },
    });
  };

  const respond = async (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;
    const userMessage = createMessage("user", text);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setTyping(true);
    setRated(null);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    try {
      const value = normalize(text);
      const words = value
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const cep = value.replace(/\D/g, "").match(/\d{8}/)?.[0];
      if (
        /^(oi|ola|e ai)( bom dia| boa tarde| boa noite)?( tudo bem)?$/.test(words) ||
        /^(bom dia|boa tarde|boa noite)( tudo bem)?$/.test(words)
      ) {
        const greeting = words.includes("bom dia")
          ? "Bom dia"
          : words.includes("boa tarde")
            ? "Boa tarde"
            : words.includes("boa noite")
              ? "Boa noite"
              : "Olá";
        addBot({
          text: `${greeting}${userName ? `, ${userName}` : ""}! Tudo bem? Posso ajudar a encontrar produtos, calcular frete, consultar seu pedido, explicar pagamentos, retirada, trocas e tamanhos. O que você precisa?`,
        });
      } else if (words.includes("tudo bem")) {
        addBot({
          text: `Tudo ótimo por aqui${userName ? `, ${userName}` : ""}! 😊 E com você? Como posso ajudar na sua compra hoje?`,
        });
      } else if (
        words.includes("o que voce faz") ||
        words.includes("como pode ajudar") ||
        words.includes("o que posso ajudar") ||
        words === "ajuda" ||
        words === "me ajude"
      ) {
        addBot({
          text: "Posso buscar produtos e tamanhos, verificar estoque, calcular frete pelo CEP, resumir seu carrinho, consultar o último pedido e explicar pagamento, retirada, trocas e devoluções.",
        });
      } else if (
        words.includes("produto original") ||
        words.includes("produtos originais") ||
        words.includes("sao originais") ||
        words.includes("e original") ||
        words.includes("autentico") ||
        words.includes("falsificado")
      ) {
        addBot({
          text: "Sim. Os produtos vendidos pela DROP Skate Shop são originais, selecionados de fornecedores confiáveis e possuem garantia contra defeitos de fabricação conforme as condições informadas na página do produto.",
        });
      } else if (
        cep &&
        (value.includes("cep") || value.includes("frete") || /^\D*\d{5}-?\d{3}\D*$/.test(text))
      )
        await calculateFreight(cep);
      else if (value.includes("frete") || value.includes("entrega") || value.includes("cep"))
        addBot({
          text: "Envie seu CEP com 8 números para eu calcular o frete do carrinho. Exemplo: 37645010.",
        });
      else if (value.includes("pedido") || value.includes("rastre") || value.includes("enviado"))
        await answerOrder();
      else if (value.includes("estoque") && contextProduct) {
        const available = (contextProduct.variants ?? [])
          .filter((variant) => variant.stock > 0)
          .map((variant) => [variant.size, variant.color].filter(Boolean).join(" · "));
        addBot({
          text: isOutOfStock(contextProduct)
            ? "Este produto está esgotado. Você pode cadastrar seu e-mail em “Avise-me quando voltar”."
            : available.length
              ? `Temos disponível: ${available.join(", ")}.`
              : `Temos ${contextProduct.stock} unidade${contextProduct.stock === 1 ? "" : "s"} em estoque.`,
        });
      } else if (value.includes("carrinho") || value.includes("sacola"))
        addBot({
          text: count
            ? `Seu carrinho tem ${count} item${count > 1 ? "s" : ""}, subtotal de ${formatBRL(subtotal)}.`
            : "Seu carrinho está vazio.",
          action: count
            ? { label: "Finalizar compra", path: "/checkout" }
            : { label: "Ver produtos", path: "/produtos" },
        });
      else if (value.includes("retira") || value.includes("loja fisica"))
        addBot({
          text: "No checkout, escolha “Retirar na loja”. A retirada é gratuita e você será avisado quando estiver pronto.",
        });
      else if (value.includes("pagamento") || value.includes("pix") || value.includes("cartao"))
        addBot({
          text: "O pagamento é processado pelo Mercado Pago. As opções disponíveis aparecem no checkout, incluindo PIX quando habilitado.",
        });
      else if (value.includes("troca") || value.includes("devolu") || value.includes("defeito"))
        addBot({
          text: "Solicite troca ou devolução pela área Minha conta. Se precisar, posso abrir o WhatsApp com esta conversa.",
        });
      else if (value.includes("tamanho") || value.includes("numero") || value.includes("medida"))
        addBot({
          text: "Os tamanhos disponíveis aparecem no produto; opções riscadas estão sem estoque. Diga o produto ou marca para eu procurar.",
        });
      else if (
        value.includes("whatsapp") ||
        value.includes("atendente") ||
        value.includes("humano")
      ) {
        openWhatsApp([...messages, userMessage]);
        addBot({ text: "Abri o WhatsApp com o resumo da conversa." });
      } else findProducts(text);
    } catch (error) {
      addBot({
        text:
          error instanceof Error
            ? error.message
            : "Não consegui concluir agora. Tente novamente ou fale com o atendimento.",
      });
    } finally {
      setTyping(false);
    }
  };

  return (
    <aside className="fixed bottom-20 right-3 z-50 flex flex-col items-end sm:right-4 lg:bottom-6 lg:right-6">
      {open && (
        <section
          id="drop-virtual-assistant"
          role="dialog"
          aria-label="Conversa com o assistente virtual da DROP"
          className="mb-3 flex max-h-[min(680px,calc(100vh-7rem))] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
              <Bot className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm uppercase">DropBot</p>
              <p className="text-xs opacity-80">Online agora · Respostas automáticas</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-primary-foreground/15"
              aria-label="Fechar assistente"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {userName && messages.length === 1 && (
              <p className="text-center text-xs text-muted-foreground">
                Olá, {userName}! Que bom ter você aqui.
              </p>
            )}
            {contextHint && messages.length === 1 && (
              <p className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-center text-xs text-muted-foreground">
                {contextHint}
              </p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "ml-auto max-w-[86%]" : "max-w-[92%]"}
              >
                <div
                  className={
                    message.role === "user"
                      ? "rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground"
                      : "rounded-2xl rounded-tl-sm bg-secondary px-4 py-3 text-sm leading-relaxed"
                  }
                >
                  {message.text}
                </div>
                {message.products?.map((product) => (
                  <Link
                    key={product.id}
                    to="/produto/$slug"
                    params={{ slug: product.slug }}
                    onClick={() => setOpen(false)}
                    className="mt-2 flex gap-3 rounded-xl border border-border bg-background p-2 hover:border-primary"
                  >
                    <img
                      src={product.images[0]}
                      alt=""
                      className="h-14 w-14 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-xs font-medium">{product.name}</span>
                      <span className="mt-1 block font-display text-sm text-primary">
                        {formatBRL(product.price)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {isOutOfStock(product) ? "Esgotado · receber aviso" : "Disponível"}
                      </span>
                    </span>
                  </Link>
                ))}
                {message.action && (
                  <Button variant="surface" size="sm" className="mt-2" asChild>
                    <Link to={message.action.path} onClick={() => setOpen(false)}>
                      {message.action.label}
                    </Link>
                  </Button>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex w-fit items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> DropBot está digitando…
              </div>
            )}
            <div ref={messagesEnd} />
          </div>
          <div className="border-t border-border bg-background p-3">
            <div className="hide-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
              {quickOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={typing}
                    onClick={() => void respond(option.prompt)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <Icon className="h-3.5 w-3.5" /> {option.label}
                  </button>
                );
              })}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void respond(input);
              }}
            >
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Digite sua dúvida…"
                maxLength={300}
                aria-label="Mensagem para o DropBot"
              />
              <Button
                type="submit"
                variant="hero"
                size="icon"
                disabled={!input.trim() || typing}
                aria-label="Enviar mensagem"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => openWhatsApp()}
                className="flex items-center gap-1.5 text-xs text-[#25D366] hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Falar com atendente{" "}
                <ExternalLink className="h-3 w-3" />
              </button>
              {messages.length > 1 && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  Resolveu?
                  <button
                    type="button"
                    aria-label="Sim, resolveu"
                    onClick={() => setRated("yes")}
                    className={rated === "yes" ? "text-primary" : "hover:text-primary"}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Não resolveu"
                    onClick={() => {
                      setRated("no");
                      openWhatsApp();
                    }}
                    className={rated === "no" ? "text-primary" : "hover:text-primary"}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) setCartOpen(false);
        }}
        aria-expanded={open}
        aria-controls="drop-virtual-assistant"
        aria-label={open ? "Fechar assistente virtual" : "Abrir assistente virtual"}
        className="group relative flex h-12 items-center gap-2 rounded-full border border-primary/40 bg-primary px-3 text-primary-foreground shadow-ember transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-14 sm:px-4 lg:h-16 lg:px-5"
      >
        {open ? <X className="h-6 w-6" /> : <WhatsAppIcon className="h-7 w-7" />}
        <span className="font-display text-xs uppercase sm:text-sm">
          {open ? "Fechar" : "Precisa de ajuda?"}
        </span>
        {!open && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-background bg-green-400" />
        )}
      </button>
    </aside>
  );
}
