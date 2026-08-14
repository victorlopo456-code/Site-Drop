import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, MapPin } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import {
  defaultSiteSettings,
  loadSiteSettings,
  whatsappUrl,
  type SiteSettings,
} from "@/lib/site-settings";

export function useInstitutionalSettings() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings);
  useEffect(() => {
    let active = true;
    void loadSiteSettings().then((loaded) => {
      if (active) setSettings(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return settings;
}

export function InstitutionalPage({
  eyebrow = "Institucional",
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="container-drop py-12 md:py-16">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>{" "}
        / {title}
      </nav>
      <header className="mt-8 max-w-3xl">
        <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
        <h1 className="mt-3 text-3xl uppercase md:text-5xl">{title}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{description}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Última atualização: 13 de agosto de 2026.
        </p>
      </header>
      <article className="mt-10 max-w-4xl space-y-8 rounded-xl border border-border bg-card p-6 md:p-10">
        {children}
      </article>
    </main>
  );
}

export function InstitutionalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl uppercase md:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

export function ContactDetails({ settings }: { settings: SiteSettings }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <a
        href={`mailto:${settings.email}`}
        className="rounded-lg border border-border p-4 hover:border-primary"
      >
        <Mail className="h-5 w-5 text-primary" />
        <span className="mt-3 block text-xs uppercase text-muted-foreground">E-mail</span>
        <span className="mt-1 block break-all text-sm">{settings.email}</span>
      </a>
      <a
        href={whatsappUrl(settings.phone)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Conversar com a DROP pelo WhatsApp: ${settings.phone}`}
        className="rounded-lg border border-border p-4 hover:border-primary"
      >
        <WhatsAppIcon className="h-5 w-5 text-primary" />
        <span className="mt-3 block text-xs uppercase text-muted-foreground">WhatsApp</span>
        <span className="mt-1 block text-sm">{settings.phone}</span>
      </a>
      <div className="rounded-lg border border-border p-4">
        <MapPin className="h-5 w-5 text-primary" />
        <span className="mt-3 block text-xs uppercase text-muted-foreground">Endereço</span>
        <span className="mt-1 block text-sm">{settings.address}</span>
      </div>
    </div>
  );
}
