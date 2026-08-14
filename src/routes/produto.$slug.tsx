import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Check,
  Heart,
  Minus,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ProductCard } from "@/components/site/ProductCard";
import {
  discountPercent,
  formatBRL,
  getProduct,
  isOutOfStock,
  totalStock,
  type Product,
} from "@/lib/catalog";
import { useProducts } from "@/lib/store";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export const Route = createFileRoute("/produto/$slug")({
  loader: ({ params }: { params: { slug: string } }) => {
    const product = getProduct(params.slug);
    return { product: product ?? null, slug: params.slug };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.product) {
      return {
        meta: [
          { title: "Produto indisponível — DROP Skate Shop" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const p = loaderData.product;
    return {
      meta: [
        { title: `${p.name} — DROP Skate Shop` },
        {
          name: "description",
          content: `${p.name} da ${p.brand} por ${formatBRL(p.price)} na DROP Skate Shop. Produto original, frete para todo o Brasil.`,
        },
        { property: "og:title", content: `${p.name} — DROP Skate Shop` },
        {
          property: "og:description",
          content: `${p.brand} · ${formatBRL(p.price)} · em até 10x sem juros.`,
        },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { product: loaded, slug } = Route.useLoaderData() as {
    product: Product | null;
    slug: string;
  };
  const all = useProducts();
  const product = all.find((p) => p.slug === slug) ?? loaded;
  const { add, favorites, toggleFavorite, setOpen } = useCart();
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const viewedProductId = product?.id;
  useEffect(() => {
    if (!viewedProductId) return;
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem("drop-viewed-products") ?? "[]");
      const current = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
      localStorage.setItem(
        "drop-viewed-products",
        JSON.stringify(
          [viewedProductId, ...current.filter((id) => id !== viewedProductId)].slice(0, 20),
        ),
      );
    } catch {
      /* armazenamento indisponível */
    }
    trackAnalyticsEvent("product_view", { productId: viewedProductId });
  }, [viewedProductId]);
  if (!product) {
    return (
      <div className="container-drop py-24 text-center">
        <h1 className="text-3xl uppercase">Produto não encontrado</h1>
        <Button variant="hero" className="mt-6" asChild>
          <Link to="/produtos" search={{ q: "", cat: "", marca: "" }}>
            Ver produtos
          </Link>
        </Button>
      </div>
    );
  }
  const off = discountPercent(product);
  const isFav = favorites.includes(product.id);
  const availableVariants = (product.variants ?? []).filter((variant) => variant.stock > 0);
  const selectedVariant =
    availableVariants.find((variant) => variant.id === selectedVariantId) ?? availableVariants[0];
  const stock = product.variants?.length ? (selectedVariant?.stock ?? 0) : totalStock(product);
  const soldOut = isOutOfStock(product) || (Boolean(product.variants?.length) && !selectedVariant);

  const related = all
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);
  const bought = all.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div className="container-drop py-10">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>{" "}
        /{" "}
        <Link
          to="/produtos"
          search={{ q: "", cat: product.category, marca: "" }}
          className="hover:text-primary"
        >
          {product.category}
        </Link>{" "}
        / <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* Galeria */}
        <div className="flex flex-col-reverse gap-4 sm:flex-row">
          <div className="flex gap-3 sm:flex-col">
            {product.images.map((img, i) => (
              <button
                key={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                className={cn(
                  "h-20 w-20 overflow-hidden rounded border transition-colors",
                  active === i ? "border-primary" : "border-border",
                )}
                aria-label={`Imagem ${i + 1}`}
              >
                <img
                  src={img}
                  alt=""
                  loading="lazy"
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
          <div className="group relative flex-1 overflow-hidden rounded-lg border border-border bg-card">
            <img
              src={product.images[active]}
              alt={product.name}
              width={800}
              height={800}
              className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-150"
            />
            {off > 0 && (
              <span className="absolute left-4 top-4 rounded bg-primary px-3 py-1 font-display text-xs uppercase text-primary-foreground">
                -{off}%
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">{product.brand}</p>
          <h1 className="mt-2 text-3xl uppercase leading-tight md:text-4xl">{product.name}</h1>

          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-4 w-4",
                    i < Math.round(product.rating)
                      ? "fill-primary text-primary"
                      : "text-muted-foreground",
                  )}
                />
              ))}
            </span>
            {product.rating.toFixed(1)} · {product.reviews} avaliações · SKU {product.sku}
          </div>

          <div className="mt-6">
            {product.compareAt && (
              <p className="text-sm text-muted-foreground line-through">
                {formatBRL(product.compareAt)}
              </p>
            )}
            <p className="font-display text-4xl text-primary">{formatBRL(product.price)}</p>
            <p className="text-sm text-muted-foreground">
              ou 10x de {formatBRL(product.price / 10)} sem juros ·{" "}
              {formatBRL(product.price * 0.95)} no PIX
            </p>
          </div>

          {!!product.variants?.length && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium">Escolha tamanho e cor</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const selected = selectedVariant?.id === variant.id;
                  return (
                    <button
                      type="button"
                      key={variant.id}
                      disabled={variant.stock <= 0 || product.soldOut}
                      onClick={() => {
                        setSelectedVariantId(variant.id);
                        setQty(1);
                      }}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm transition-colors",
                        selected ? "border-primary text-primary" : "border-border",
                        (variant.stock <= 0 || product.soldOut) &&
                          "cursor-not-allowed opacity-40 line-through",
                      )}
                    >
                      {[variant.size, variant.color].filter(Boolean).join(" · ")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-md border border-border">
              <button
                aria-label="Diminuir"
                className="grid h-11 w-11 place-items-center hover:text-primary"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center">{qty}</span>
              <button
                aria-label="Aumentar"
                className="grid h-11 w-11 place-items-center hover:text-primary"
                onClick={() => setQty((n) => Math.min(Math.max(stock, 1), n + 1))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {soldOut ? "Produto esgotado" : `${stock} em estoque`}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              variant="hero"
              size="xl"
              disabled={soldOut || buying}
              onClick={async () => {
                setBuying(true);
                try {
                  const supabase = getSupabaseBrowserClient();
                  const { data } = (await supabase?.auth.getSession()) ?? {
                    data: { session: null },
                  };

                  if (!data.session) {
                    add(product, qty, selectedVariant);
                    setOpen(false);
                    toast.info("Entre ou crie sua conta para continuar a compra.");
                    sessionStorage.setItem("drop-auth-redirect", "/checkout");
                    await navigate({ to: "/entrar" });
                    return;
                  }

                  add(product, qty, selectedVariant);
                  setOpen(false);
                  await navigate({ to: "/checkout" });
                } finally {
                  setBuying(false);
                }
              }}
            >
              {soldOut ? "Esgotado" : buying ? "Verificando…" : "Comprar agora"}
            </Button>
            <Button
              variant="outlineLight"
              size="xl"
              disabled={soldOut}
              onClick={() => add(product, qty, selectedVariant)}
            >
              <ShoppingBag /> Adicionar ao carrinho
            </Button>
          </div>

          <div className="mt-4 flex gap-4 text-sm">
            <button
              className="flex items-center gap-2 text-muted-foreground hover:text-primary"
              onClick={() => toggleFavorite(product.id)}
            >
              <Heart className={cn("h-4 w-4", isFav && "fill-primary text-primary")} />
              {isFav ? "Favoritado" : "Favoritar"}
            </button>
            <button
              className="flex items-center gap-2 text-muted-foreground hover:text-primary"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
                toast.success("Link copiado!");
              }}
            >
              <Share2 className="h-4 w-4" /> Compartilhar
            </button>
          </div>

          <Separator className="my-6" />

          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" /> Frete grátis acima de R$ 399
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Produto original com garantia
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" /> Troca fácil em até 30 dias
            </li>
          </ul>
        </div>
      </div>

      {/* Abas */}
      <Tabs defaultValue="descricao" className="mt-14">
        <TabsList className="flex-wrap">
          <TabsTrigger value="descricao">Descrição</TabsTrigger>
          <TabsTrigger value="medidas">Tabela de medidas</TabsTrigger>
          <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
          <TabsTrigger value="duvidas">Perguntas</TabsTrigger>
        </TabsList>

        <TabsContent value="descricao" className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            {product.specs.map((s) => (
              <div
                key={s.label}
                className="flex justify-between border-b border-border pb-2 text-sm"
              >
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>

        <TabsContent value="medidas" className="rounded-lg border border-border bg-card p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Tamanho</th>
                <th className="pb-2">Largura</th>
                <th className="pb-2">Comprimento</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["P", "50 cm", "70 cm"],
                ["M", "54 cm", "72 cm"],
                ["G", "58 cm", "74 cm"],
                ["GG", "62 cm", "76 cm"],
              ].map((row) => (
                <tr key={row[0]} className="border-t border-border">
                  {row.map((cell) => (
                    <td key={cell} className="py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent
          value="avaliacoes"
          className="space-y-4 rounded-lg border border-border bg-card p-6"
        >
          {[
            {
              nome: "Rafael M.",
              nota: 5,
              texto: "Qualidade absurda, chegou em 3 dias. Recomendo demais.",
            },
            {
              nome: "Bianca S.",
              nota: 4,
              texto: "Muito bom, só achei o preço do frete um pouco alto.",
            },
            {
              nome: "Lucas P.",
              nota: 5,
              texto: "Original e bem embalado. Já é minha loja de skate favorita.",
            },
          ].map((r) => (
            <div key={r.nome} className="border-b border-border pb-4 last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm uppercase">{r.nome}</span>
                <span className="flex">
                  {Array.from({ length: r.nota }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
                  ))}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.texto}</p>
            </div>
          ))}
        </TabsContent>

        <TabsContent
          value="duvidas"
          className="space-y-4 rounded-lg border border-border bg-card p-6"
        >
          <div>
            <p className="text-sm font-semibold">Serve para iniciante?</p>
            <p className="text-sm text-muted-foreground">
              Sim, é um setup equilibrado para street e park.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Vocês enviam para todo o Brasil?</p>
            <p className="text-sm text-muted-foreground">
              Sim, com Correios, Jadlog, Loggi e Melhor Envio.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl uppercase">Produtos relacionados</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-16">
        <h2 className="mb-6 text-2xl uppercase">Comprados juntos</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {bought.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
