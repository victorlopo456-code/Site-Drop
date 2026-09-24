import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, Home, LayoutGrid, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCurrentUserName } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { count, favorites, setOpen } = useCart();
  const userName = useCurrentUserName();
  const itemClass = (active: boolean) =>
    cn(
      "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground",
    );

  return (
    <nav
      aria-label="Navegação principal no celular"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch px-1">
        <Link to="/" className={itemClass(pathname === "/")}>
          <Home className="h-5 w-5" />
          <span>Início</span>
        </Link>
        <Link
          to="/produtos"
          search={{ q: "", cat: "", marca: "" }}
          className={itemClass(pathname.startsWith("/produto"))}
        >
          <LayoutGrid className="h-5 w-5" />
          <span>Produtos</span>
        </Link>
        <Link to="/conta" className={itemClass(pathname === "/conta")}>
          <span className="relative">
            <Heart className="h-5 w-5" />
            {favorites.length > 0 && (
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {favorites.length}
              </span>
            )}
          </span>
          <span>Favoritos</span>
        </Link>
        <Link to={userName ? "/conta" : "/entrar"} className={itemClass(pathname === "/entrar")}>
          <User className="h-5 w-5" />
          <span className="max-w-full truncate">{userName ?? "Entrar"}</span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} className={itemClass(false)}>
          <span className="relative">
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </span>
          <span>Carrinho</span>
        </button>
      </div>
    </nav>
  );
}
