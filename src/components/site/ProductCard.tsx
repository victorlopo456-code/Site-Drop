import { Link } from "@tanstack/react-router";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { discountPercent, formatBRL, isOutOfStock, type Product } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const { add, favorites, toggleFavorite } = useCart();
  const off = discountPercent(product);
  const isFav = favorites.includes(product.id);
  const soldOut = isOutOfStock(product);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-card",
        className,
      )}
    >
      <Link
        to="/produto/$slug"
        params={{ slug: product.slug }}
        className="relative block aspect-square overflow-hidden bg-surface"
      >
        <img
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          width={800}
          height={800}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        {off > 0 && (
          <span className="absolute left-3 top-3 rounded bg-primary px-2 py-1 font-display text-[11px] uppercase text-primary-foreground">
            -{off}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-0 grid place-items-center bg-background/70 font-display text-sm uppercase tracking-widest text-foreground backdrop-blur-[2px]">
            Esgotado
          </span>
        )}
        {product.tags.includes("lancamentos") && (
          <span className="absolute right-3 top-3 rounded border border-border bg-background/80 px-2 py-1 font-display text-[11px] uppercase text-foreground backdrop-blur">
            Novo
          </span>
        )}
      </Link>

      <button
        type="button"
        aria-label="Favoritar produto"
        onClick={() => toggleFavorite(product.id)}
        className="absolute right-3 top-14 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:text-primary"
      >
        <Heart className={cn("h-4 w-4", isFav && "fill-primary text-primary")} />
      </button>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {product.brand}
        </span>
        <Link
          to="/produto/$slug"
          params={{ slug: product.slug }}
          className="line-clamp-2 text-sm font-semibold leading-snug transition-colors hover:text-primary"
        >
          {product.name}
        </Link>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
          {product.rating.toFixed(1)}
          <span>({product.reviews})</span>
        </div>

        <div className="mt-auto pt-2">
          {product.compareAt && (
            <p className="text-xs text-muted-foreground line-through">
              {formatBRL(product.compareAt)}
            </p>
          )}
          <p className="font-display text-xl text-primary">{formatBRL(product.price)}</p>
          <p className="text-[11px] text-muted-foreground">
            ou 10x de {formatBRL(product.price / 10)} sem juros
          </p>
        </div>

        {product.variants?.length && !soldOut ? (
          <Button variant="hero" size="sm" className="mt-3 w-full" asChild>
            <Link to="/produto/$slug" params={{ slug: product.slug }}>
              Escolher opções
            </Link>
          </Button>
        ) : (
          <Button
            variant={soldOut ? "surface" : "hero"}
            size="sm"
            className="mt-3 w-full"
            disabled={soldOut}
            onClick={() => add(product)}
          >
            <ShoppingBag /> {soldOut ? "Esgotado" : "Adicionar"}
          </Button>
        )}
      </div>
    </article>
  );
}
