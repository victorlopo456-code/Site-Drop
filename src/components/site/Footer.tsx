import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Instagram, Mail, MapPin, Youtube } from "lucide-react";
import logo from "@/assets/logo-drop.png";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useTaxonomy } from "@/lib/taxonomy";
import {
  defaultSiteSettings,
  loadSiteSettings,
  whatsappUrl,
  type SiteSettings,
} from "@/lib/site-settings";

export function Footer() {
  const categories = useTaxonomy().categories.filter((category) => category.enabled);
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

  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="container-drop grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Link to="/" aria-label="DROP Skate Shop — ir para a página inicial">
            <img
              src={logo}
              alt="DROP Skate Shop"
              width={1280}
              height={1280}
              loading="lazy"
              className="h-24 w-24 object-contain"
            />
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">{settings.store_description}</p>
          <div className="flex gap-3">
            {settings.instagram_url && (
              <a
                href={settings.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir Instagram da DROP Skate Shop"
                className="text-muted-foreground hover:text-primary"
              >
                <Instagram className="h-5 w-5" />
              </a>
            )}
            {settings.youtube_url && (
              <a
                href={settings.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir YouTube da DROP Skate Shop"
                className="text-muted-foreground hover:text-primary"
              >
                <Youtube className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>

        <div>
          <p className="mb-4 font-display text-xs uppercase tracking-[0.2em] text-primary">
            Categorias
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/produtos"
                  search={{ q: "", cat: c.slug, marca: "" }}
                  className="hover:text-foreground"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-4 font-display text-xs uppercase tracking-[0.2em] text-primary">
            Institucional
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/sobre" className="hover:text-foreground">
                Sobre a DROP
              </Link>
            </li>
            <li>
              <Link to="/promocoes" className="hover:text-foreground">
                Promoções
              </Link>
            </li>
            <li>
              <Link to="/entrar" className="hover:text-foreground">
                Minha conta
              </Link>
            </li>
            <li>
              <Link to="/conta" className="hover:text-foreground">
                Meus pedidos
              </Link>
            </li>
            <li>
              <Link to="/politica-de-entrega" className="hover:text-foreground">
                Política de entrega
              </Link>
            </li>
            <li>
              <Link to="/trocas-e-devolucoes" className="hover:text-foreground">
                Trocas e devoluções
              </Link>
            </li>
            <li>
              <Link to="/politica-de-privacidade" className="hover:text-foreground">
                Política de privacidade (LGPD)
              </Link>
            </li>
            <li>
              <Link to="/termos-de-uso" className="hover:text-foreground">
                Termos de uso
              </Link>
            </li>
            <li>
              <Link to="/contato" className="hover:text-foreground">
                Contato
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="mb-4 font-display text-xs uppercase tracking-[0.2em] text-primary">
            Atendimento
          </p>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <a
                href={whatsappUrl(settings.phone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Conversar com a DROP pelo WhatsApp: ${settings.phone}`}
                className="flex items-center gap-2 hover:text-foreground"
              >
                <WhatsAppIcon className="h-4 w-4 shrink-0 text-primary" />
                {settings.phone}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              <a href={`mailto:${settings.email}`} className="break-all hover:text-foreground">
                {settings.email}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {settings.address}
            </li>
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            Pagamento: {settings.payment_methods}
          </p>
        </div>
      </div>

      <div className="border-t border-border py-5">
        <p className="container-drop text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} DROP Skate Shop
          {settings.company_document ? ` · ${settings.company_document}` : ""} ·{" "}
          {settings.copyright_text}
        </p>
      </div>
    </footer>
  );
}
