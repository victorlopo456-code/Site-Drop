import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Bot, ExternalLink, MessageCircle, PackageSearch, ShoppingBag, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import {
  defaultSiteSettings,
  loadSiteSettings,
  whatsappUrl,
  type SiteSettings,
} from "@/lib/site-settings";

const supportOptions = [
  {
    label: "Dúvida sobre produto",
    icon: ShoppingBag,
    message: "Olá! Vim pelo site da DROP e gostaria de tirar uma dúvida sobre um produto.",
  },
  {
    label: "Ajuda com meu pedido",
    icon: PackageSearch,
    message: "Olá! Vim pelo site da DROP e preciso de ajuda com o meu pedido.",
  },
  {
    label: "Falar com o suporte",
    icon: MessageCircle,
    message: "Olá! Vim pelo assistente virtual do site da DROP e gostaria de atendimento.",
  },
] as const;

function supportUrl(phone: string, message: string) {
  return `${whatsappUrl(phone)}?text=${encodeURIComponent(message)}`;
}

export function VirtualAssistant() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
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
    <aside className="fixed bottom-4 right-4 z-50 flex flex-col items-end sm:bottom-6 sm:right-6">
      {open && (
        <section
          id="drop-virtual-assistant"
          role="dialog"
          aria-label="Assistente virtual da DROP"
          className="mb-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
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

            <div className="space-y-2" aria-label="Opções de atendimento">
              {supportOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => openWhatsApp(option.message)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="flex-1 font-medium">{option.label}</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </button>
                );
              })}
            </div>

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
        className="group relative flex h-14 items-center gap-2 rounded-full border border-primary/40 bg-primary px-4 text-primary-foreground shadow-ember transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-16 sm:px-5"
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
