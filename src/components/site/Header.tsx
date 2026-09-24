import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, LogOut, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo-drop.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatBRL } from "@/lib/catalog";
import { smartSearchProducts } from "@/lib/product-search";
import { useProducts } from "@/lib/store";
import { useTaxonomy } from "@/lib/taxonomy";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, useAdminAccess, useCurrentUserName } from "@/lib/supabase";
import {
  defaultSiteAnnouncements,
  loadSiteAnnouncements,
  type SiteAnnouncement,
} from "@/lib/site-announcements";

const groups = ["Skate", "Vestuário", "Acessórios"] as const;

function SearchBox({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const products = useProducts();
  const results = smartSearchProducts(products, query, 8);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = () => {
    onNavigate?.();
    setFocused(false);
    navigate({ to: "/produtos", search: { q: query, cat: "", marca: "" } });
  };

  return (
    <div ref={ref} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 transition-colors focus-within:border-primary"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          maxLength={80}
          placeholder="Busque por produto, marca, categoria ou SKU"
          className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          aria-label="Buscar produtos"
        />
        {query && (
          <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")}>
            <X className="h-4 w-4 text-muted-foreground hover:text-primary" />
          </button>
        )}
      </form>

      {focused && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-card">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum resultado para “{query}”. Tente uma marca, categoria ou SKU.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/produto/$slug"
                    params={{ slug: p.slug }}
                    onClick={() => {
                      setFocused(false);
                      onNavigate?.();
                    }}
                    className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-accent"
                  >
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      loading="lazy"
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="block text-[11px] uppercase tracking-widest text-muted-foreground">
                        {p.brand} · {p.sku}
                      </span>
                    </span>
                    <span className="font-display text-sm text-primary">{formatBRL(p.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={go}
            className="w-full border-t border-border bg-surface px-3 py-2 text-left text-xs uppercase tracking-widest text-primary"
          >
            Ver todos os resultados
          </button>
        </div>
      )}
    </div>
  );
}

function MegaMenu() {
  const taxonomy = useTaxonomy();
  const categories = taxonomy.categories.filter((category) => category.enabled);
  const brands = taxonomy.brands.filter((brand) => brand.enabled);
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="flex h-10 items-center gap-2 font-display text-sm uppercase tracking-wide text-foreground transition-colors hover:text-primary">
        <Menu className="h-4 w-4" /> Categorias
      </button>
      <div
        className={cn(
          "invisible absolute left-0 top-full z-50 w-[min(64rem,90vw)] origin-top -translate-y-2 rounded-lg border border-border bg-popover p-6 opacity-0 shadow-card transition-all duration-300",
          open && "visible translate-y-0 opacity-100",
        )}
      >
        <div className="grid gap-8 md:grid-cols-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-3 font-display text-xs uppercase tracking-[0.2em] text-primary">
                {group}
              </p>
              <ul className="space-y-2">
                {categories
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <li key={c.slug}>
                      <Link
                        to="/produtos"
                        search={{ q: "", cat: c.slug, marca: "" }}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="mb-3 font-display text-xs uppercase tracking-[0.2em] text-primary">
              Marcas
            </p>
            <ul className="grid grid-cols-2 gap-2">
              {brands.map((b) => (
                <li key={b.id}>
                  <Link
                    to="/produtos"
                    search={{ q: "", cat: "", marca: b.name }}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const navigate = useNavigate();
  const categories = useTaxonomy().categories.filter((category) => category.enabled);
  const { count, setOpen, favorites } = useCart();
  const isAdmin = useAdminAccess();
  const userName = useCurrentUserName();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [announcements, setAnnouncements] = useState<SiteAnnouncement[]>(defaultSiteAnnouncements);

  useEffect(() => {
    let active = true;
    void loadSiteAnnouncements().then((loaded) => {
      if (active) setAnnouncements(loaded.filter((item) => item.enabled));
    });
    const update = (event: Event) => {
      const items = (event as CustomEvent<SiteAnnouncement[]>).detail;
      if (items) setAnnouncements(items.filter((item) => item.enabled));
    };
    window.addEventListener("drop-announcements-updated", update);
    return () => {
      active = false;
      window.removeEventListener("drop-announcements-updated", update);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-xl">
      {announcements.length > 0 && (
        <div className="overflow-hidden border-b border-border bg-surface py-1.5 sm:py-2">
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {Array.from({ length: 2 }).map((_, i) => (
              <span key={i} className="flex gap-10">
                {announcements.map((item) => (
                  <span
                    key={`${i}-${item.id}`}
                    className={item.accent ? "text-primary" : undefined}
                  >
                    {item.text}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="container-drop grid grid-cols-[auto_1fr_auto] items-center gap-1.5 py-1.5 sm:gap-4 sm:py-3 lg:gap-8">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(20rem,90vw)] overflow-y-auto bg-background p-5 sm:p-6"
            >
              <SheetTitle className="font-display uppercase">Menu</SheetTitle>
              <nav className="mt-6 space-y-6">
                {groups.map((group) => (
                  <div key={group}>
                    <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-primary">
                      {group}
                    </p>
                    <ul className="space-y-2">
                      {categories
                        .filter((c) => c.group === group)
                        .map((c) => (
                          <li key={c.slug}>
                            <Link
                              to="/produtos"
                              search={{ q: "", cat: c.slug, marca: "" }}
                              onClick={() => setMobileOpen(false)}
                              className="text-sm text-muted-foreground hover:text-foreground"
                            >
                              {c.name}
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
                <Link
                  to="/promocoes"
                  onClick={() => setMobileOpen(false)}
                  className="block font-display text-sm uppercase text-primary"
                >
                  Promoções
                </Link>
                <Link
                  to="/entrar"
                  onClick={() => setMobileOpen(false)}
                  className="block font-display text-sm uppercase"
                >
                  Entrar
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileOpen(false)}
                    className="block font-display text-sm uppercase text-primary"
                  >
                    Gerenciar
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="shrink-0" aria-label="DROP Skate Shop — página inicial">
            <img
              src={logo}
              alt="DROP Skate Shop"
              width={1280}
              height={1280}
              className="h-11 w-11 object-contain sm:h-14 sm:w-14 lg:h-16 lg:w-16"
            />
          </Link>
        </div>

        <div className="hidden lg:block">
          <SearchBox />
        </div>

        <div className="flex items-center gap-0 sm:gap-1">
          <Button variant="ghost" size="icon" asChild aria-label="Favoritos">
            <Link to="/conta" className="relative">
              <Heart />
              {favorites.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {favorites.length}
                </span>
              )}
            </Link>
          </Button>
          {userName && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={signingOut}
              aria-label="Sair da conta"
              title="Sair da conta"
              onClick={async () => {
                const supabase = getSupabaseBrowserClient();
                if (!supabase) return;
                setSigningOut(true);
                const { error } = await supabase.auth.signOut();
                setSigningOut(false);
                if (error) return toast.error("Não foi possível sair da conta.");
                toast.success("Você saiu da sua conta.");
                await navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size={userName ? "default" : "icon"}
            asChild
            aria-label={userName ? `Minha conta, ${userName}` : "Entrar ou criar conta"}
            className={userName ? "max-w-36 gap-2 px-2 sm:px-3" : undefined}
          >
            <Link to={userName ? "/conta" : "/entrar"}>
              <User />
              {userName && (
                <span className="hidden truncate text-sm sm:inline">Olá, {userName}</span>
              )}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Abrir carrinho"
            className="relative"
          >
            <ShoppingBag />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="container-drop pb-2 sm:pb-3 lg:hidden">
        <SearchBox onNavigate={() => setMobileOpen(false)} />
      </div>

      <nav className="hidden border-t border-border lg:block">
        <div className="container-drop flex items-center gap-6">
          <MegaMenu />
          <Link
            to="/produtos"
            search={{ q: "", cat: "", marca: "" }}
            className="font-display text-sm uppercase tracking-wide transition-colors hover:text-primary"
          >
            Todos
          </Link>
          <Link
            to="/produtos"
            search={{ q: "", cat: "shapes", marca: "" }}
            className="font-display text-sm uppercase tracking-wide transition-colors hover:text-primary"
          >
            Shapes
          </Link>
          <Link
            to="/produtos"
            search={{ q: "", cat: "tenis", marca: "" }}
            className="font-display text-sm uppercase tracking-wide transition-colors hover:text-primary"
          >
            Tênis
          </Link>
          <Link
            to="/produtos"
            search={{ q: "", cat: "camisetas", marca: "" }}
            className="font-display text-sm uppercase tracking-wide transition-colors hover:text-primary"
          >
            Streetwear
          </Link>
          <Link
            to="/promocoes"
            className="font-display text-sm uppercase tracking-wide text-primary transition-opacity hover:opacity-80"
          >
            Promoções
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="font-display text-sm uppercase tracking-wide text-primary transition-opacity hover:opacity-80"
            >
              Gerenciar
            </Link>
          )}
        </div>
      </nav>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
    </header>
  );
}
