import { createFileRoute } from "@tanstack/react-router";
import { ProductCard } from "@/components/site/ProductCard";
import { useProducts } from "@/lib/store";

export const Route = createFileRoute("/promocoes")({
  head: () => ({
    meta: [
      { title: "Promoções — DROP Skate Shop" },
      {
        name: "description",
        content:
          "Ofertas em shapes, rodas, trucks, tênis e streetwear. Descontos de até 30% na DROP Skate Shop.",
      },
      { property: "og:title", content: "Promoções — DROP Skate Shop" },
      { property: "og:description", content: "Descontos de até 30% em skate e streetwear." },
    ],
  }),
  component: Promos,
});

function Promos() {
  const deals = useProducts().filter((p) => p.tags.includes("promocoes"));
  return (
    <div className="container-drop py-12">
      <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Semana DROP</p>
      <h1 className="mt-2 text-4xl uppercase md:text-5xl">Promoções</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Descontos reais em produtos originais. Use os cupons DROP10, SKATE15 ou BLACK20 no carrinho.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {deals.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
