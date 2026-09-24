import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bot,
  CreditCard,
  ExternalLink,
  MapPin,
  MessageCircle,
  PackageSearch,
  Truck,
  X,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import {
  defaultSiteSettings,
  loadSiteSettings,
  whatsappUrl,
  type SiteSettings,
} from "@/lib/site-settings";

const supportOptions = [
  {
    label: "Entrega e frete",
    icon: Truck,
    answer:
      "Você pode calcular o frete pelo CEP no carrinho ou no checkout, mesmo sem entrar na conta. O prazo aparece junto com cada opção.",
  },
  {
    label: "Acompanhar pedido",
    icon: PackageSearch,
    answer:
      "Entre em Minha conta e abra Meus pedidos. Lá você acompanha o status e pode abrir o rastreamento da transportadora.",
    path: "/conta",
  },
  {
    label: "Retirada na loja",
    icon: MapPin,
    answer:
      "Escolha “Retirar na loja” no checkout. A retirada é gratuita e você será avisado quando o pedido estiver pronto.",
  },
  {
    label: "Pagamento",
    icon: CreditCard,
    answer:
      "O pagamento é processado com segurança pelo Mercado Pago. Você pode pagar usando as opções disponíveis no checkout.",
  },
] as const;

function supportUrl(phone: string, message: string) {
  return `${whatsappUrl(phone)}?text=${encodeURIComponent(message)}`;
}

export function VirtualAssistant() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [settings, setSettings] = useState(defaultSiteSettings);

  useEffect(() => {
    let active = true;
    void loadSiteSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    const update = (event: Event) =>
      setSettings((event as CustomEvent<SiteSettings>).detail ?? defaultSiteSettings);
    window.addEventListener("drop-site-settings-updated", update);
    return () => {
      active = false;
      window.removeEventListener("drop-site-settings-updated", update);
    };
  }, []);

  if (pathname.startsWith("/admin")) return null;

  const openWhatsApp = (message: string) => {
    window.open(supportUrl(settings.phone, message), "_blank", "noopener,noreferrer");
  };

  return (
    <aside className="fixed bottom-20 right-3 z-50 flex flex-col items-end sm:right-4 lg:bottom-6 lg:right-6">
      {open && (
        <section
          id="drop-virtual-assistant"
          role="dialog"
          aria-label="Assistente virtual da DROP"
          className="mb-3 max-h-[calc(100vh-7rem)] w-[calc(100vw-1.5rem)] max-w-sm overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
        >
          <header className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
              <Bot className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm uppercase">DropBot</p>
              <p className="text-xs opacity-80">Assistente virtual · Atendimento via WhatsApp</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-primary-foreground/15"
              aria-label="Fechar assistente"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="space-y-4 p-4">
            <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-secondary px-4 py-3 text-sm leading-relaxed">
              Olá! 👋 Eu sou o <strong>DropBot</strong>. Como posso ajudar você hoje?
            </div>

            {answer && (
              <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-relaxed">
                {answer}
              </div>
            )}

            <div className="space-y-2" aria-label="Opções de atendimento">
              {supportOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      setAnswer(option.answer);
                      if ("path" in option && option.path) {
                        window.setTimeout(() => {
                          setOpen(false);
                          void navigate({ to: option.path });
                        }, 900);
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="flex-1 font-medium">{option.label}</span>
                    <span className="text-primary" aria-hidden>
                      ›
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                openWhatsApp(
                  `Olá! Vim pelo DropBot e preciso de ajuda. Estou na página ${window.location.href}`,
                )
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 font-display text-sm uppercase text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle className="h-5 w-5" /> Falar com atendente
              <ExternalLink className="h-4 w-4" />
            </button>

            <p className="text-center text-[11px] text-muted-foreground">
              Ao escolher uma opção, você continuará o atendimento no WhatsApp.
            </p>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
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
