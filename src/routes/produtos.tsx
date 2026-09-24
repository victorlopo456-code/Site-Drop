import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProductCard } from "@/components/site/ProductCard";
import { Button } from "@/components/ui/button";
import { useTaxonomy } from "@/lib/taxonomy";
import { useProducts } from "@/lib/store";
import { smartSearchProducts } from "@/lib/product-search";

type ProductSearch = { q: string; cat: string; marca: string };

export const Route = createFileRoute("/produtos")({
  validateSearch: (search: Record<string, unknown>): ProductSearch => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : "",
    cat: typeof search.cat === "string" ? search.cat.slice(0, 40) : "",
    marca: typeof search.marca === "string" ? search.marca.slice(0, 40) : "",
  }),
  head: () => ({
    meta: [
      { title: "Produtos — DROP Skate Shop" },
      {
        name: "description",
        content:
          "Explore shapes, rodas, trucks, rolamentos, tênis e streetwear na DROP Skate Shop. Filtre por categoria, marca e preço.",
      },
      { property: "og:title", content: "Produtos — DROP Skate Shop" },
      {
        property: "og:description",
        content: "Catálogo completo de skate e streetwear com entrega para todo o Brasil.",
      },
    ],
  }),
  component: ProductsPage,
});

const sorts = {
  relevancia: "Relevância",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
  avaliacao: "Melhor avaliados",
} as const;

function ProductsPage() {
  const taxonomy = useTaxonomy();
  const categories = taxonomy.categories.filter((category) => category.enabled);
  const brands = taxonomy.brands.filter((brand) => brand.enabled);
  const { q, cat, marca } = Route.useSearch();
  const [sort, setSort] = useState<keyof typeof sorts>("relevancia");
  const products = useProducts();

  const list = useMemo(() => {
    const searched = q.trim() ? smartSearchProducts(products, q) : products;
    let result = searched.filter((p) => {
      const matchCat = !cat || p.category === cat;
      const matchBrand = !marca || p.brand === marca;
      return matchCat && matchBrand;
    });
    if (sort === "menor-preco") result = [...result].sort((a, b) => a.price - b.price);
    if (sort === "maior-preco") result = [...result].sort((a, b) => b.price - a.price);
    if (sort === "avaliacao") result = [...result].sort((a, b) => b.rating - a.rating);
    return result;
  }, [q, cat, marca, sort, products]);

  const catName = categories.find((c) => c.slug === cat)?.name;

  return (
    <div className="container-drop py-6 sm:py-10">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>{" "}
        / <span className="text-foreground">{catName ?? marca ?? "Todos os produtos"}</span>
      </nav>

      <h1 className="mt-3 text-3xl uppercase md:text-4xl">
        {q ? `Resultados para "${q}"` : (catName ?? marca ?? "Todos os produtos")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{list.length} produto(s) encontrado(s)</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-8">
          <div>
            <p className="mb-3 font-display text-xs uppercase tracking-[0.2em] text-primary">
              Categorias
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  to="/produtos"
                  search={{ q, cat: "", marca }}
                  className={
                    cat === "" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Todas
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    to="/produtos"
                    search={{ q, cat: c.slug, marca }}
                    className={
                      cat === c.slug
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 font-display text-xs uppercase tracking-[0.2em] text-primary">
              Marcas
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  to="/produtos"
                  search={{ q, cat, marca: "" }}
                  className={
                    marca === "" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Todas
                </Link>
              </li>
              {brands.map((b) => (
                <li key={b.id}>
                  <Link
                    to="/produtos"
                    search={{ q, cat, marca: b.name }}
                    className={
                      marca === b.name
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }
                  >
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div>
          <div className="mb-6 flex flex-wrap gap-2">
            {(Object.keys(sorts) as (keyof typeof sorts)[]).map((key) => (
              <Button
                key={key}
                variant={sort === key ? "hero" : "surface"}
                size="sm"
                onClick={() => setSort(key)}
              >
                {sorts[key]}
              </Button>
            ))}
          </div>

          {list.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
              Nenhum produto encontrado. Tente outra busca ou filtro.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
