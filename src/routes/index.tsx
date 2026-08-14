import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgePercent, CreditCard, ShieldCheck, Truck } from "lucide-react";
import heroImg from "@/assets/hero-skate.jpg";
import logo from "@/assets/logo-drop.png";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/site/ProductCard";
import { useTaxonomy } from "@/lib/taxonomy";
import { getSiteBenefits, type SiteBenefit } from "@/lib/site-benefits";
import { useProducts } from "@/lib/store";

const benefitIconComponents = {
  truck: Truck,
  card: CreditCard,
  shield: ShieldCheck,
  coupon: BadgePercent,
} satisfies Record<SiteBenefit["icon"], typeof Truck>;

export const Route = createFileRoute("/")({
  loader: () => getSiteBenefits(),
  head: () => ({
    meta: [
      { title: "DROP Skate Shop — Skate, Streetwear e Lifestyle Urbano" },
      {
        name: "description",
        content:
          "Shapes, rodas, trucks, tênis e streetwear das melhores marcas. Frete grátis acima de R$ 399 e 10x sem juros na DROP Skate Shop.",
      },
      { property: "og:title", content: "DROP Skate Shop — Skate, Streetwear e Lifestyle Urbano" },
      {
        property: "og:description",
        content: "Curadoria premium de skate e streetwear. Entrega para todo o Brasil.",
      },
    ],
  }),
  component: Home,
});

function SectionHeader({
  eyebrow,
  title,
  to,
}: {
  eyebrow: string;
  title: string;
  to?: { cat?: string; promo?: boolean };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-3xl uppercase md:text-4xl">{title}</h2>
      </div>
      {to?.promo ? (
        <Button variant="outlineLight" size="sm" asChild>
          <Link to="/promocoes">
            Ver tudo <ArrowRight />
          </Link>
        </Button>
      ) : (
        <Button variant="outlineLight" size="sm" asChild>
          <Link to="/produtos" search={{ q: "", cat: to?.cat ?? "", marca: "" }}>
            Ver tudo <ArrowRight />
          </Link>
        </Button>
      )}
    </div>
  );
}

function Home() {
  const taxonomy = useTaxonomy();
  const categories = taxonomy.categories.filter((category) => category.enabled);
  const brands = taxonomy.brands.filter((brand) => brand.enabled);
  const benefits = Route.useLoaderData();
  const products = useProducts();
  const bestSellers = products.filter((product) => product.tags.includes("mais-vendidos"));
  const news = products.filter((product) => product.tags.includes("lancamentos"));
  const deals = products.filter((product) => product.tags.includes("promocoes"));

  return (
    <>
      {/* HERO */}
      <section className="relative isolate flex min-h-[78vh] items-center overflow-hidden">
        <img
          src={heroImg}
          alt="Skatista realizando manobra em bowl urbano à noite"
          width={1920}
          height={1088}
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        <div className="container-drop animate-rise py-20">
          <Link
            to="/"
            aria-label="DROP Skate Shop — ir para a página inicial"
            className="mb-8 block w-fit"
          >
            <img
              src={logo}
              alt="DROP Skate Shop"
              width={1280}
              height={1280}
              className="h-40 w-40 rounded-full object-contain md:h-52 md:w-52"
            />
          </Link>
          <p className="font-display text-xs uppercase tracking-[0.4em] text-primary">
            Coleção 2026 · Street & Park
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl uppercase leading-[0.95] md:text-7xl">
            Seu setup começa <span className="text-gradient-ember">aqui</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            Shapes, rodas, trucks, tênis e streetwear das marcas que moldaram a cultura do skate.
            Curadoria DROP, entrega rápida e produtos 100% originais.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button variant="hero" size="xl" asChild>
              <Link to="/produtos" search={{ q: "", cat: "", marca: "" }}>
                Comprar agora <ArrowRight />
              </Link>
            </Button>
            <Button variant="outlineLight" size="xl" asChild>
              <Link to="/promocoes">Ver promoções</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="border-y border-border bg-surface">
        <div className="container-drop grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => {
            const Icon = benefitIconComponents[benefit.icon];
            return (
              <div key={benefit.id} className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border bg-background text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-sm uppercase">{benefit.title}</span>
                  <span className="block text-xs text-muted-foreground">{benefit.description}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* MAIS VENDIDOS */}
      <section className="container-drop py-16">
        <SectionHeader eyebrow="Top da loja" title="Os mais vendidos" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {bestSellers.slice(0, 8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* CATEGORIAS */}
      <section className="container-drop py-8">
        <SectionHeader eyebrow="Navegue por" title="Categorias" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to="/produtos"
              search={{ q: "", cat: c.slug, marca: "" }}
              className="group relative overflow-hidden rounded-lg border border-border bg-card"
            >
              <img
                src={c.image}
                alt={c.name}
                loading="lazy"
                width={800}
                height={800}
                className="aspect-square w-full object-cover opacity-80 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent p-3 font-display text-sm uppercase transition-colors group-hover:text-primary">
                {c.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* LANÇAMENTOS */}
      <section className="container-drop py-16">
        <SectionHeader eyebrow="Acabou de chegar" title="Lançamentos" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {news.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* BANNER PROMO */}
      <section className="container-drop">
        <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-surface p-8 md:p-14">
          <div
            className="absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
            style={{ background: "var(--gradient-ember)" }}
            aria-hidden
          />
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">
            Semana DROP
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl uppercase md:text-5xl">
            Até 30% OFF em setups completos
          </h2>
          <p className="mt-3 max-w-lg text-muted-foreground">
            Monte seu skate com shape, truck, rodas e rolamentos com desconto progressivo. Use o
            cupom <span className="font-display text-primary">BLACK20</span>.
          </p>
          <Button variant="hero" size="lg" className="mt-7" asChild>
            <Link to="/promocoes">
              Ver promoções <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* OFERTAS */}
      <section className="container-drop py-16">
        <SectionHeader eyebrow="Preço baixou" title="Promoções" to={{ promo: true }} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {deals.slice(0, 8).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* MARCAS */}
      <section className="border-y border-border bg-surface py-12">
        <div className="container-drop">
          <p className="mb-6 text-center font-display text-xs uppercase tracking-[0.3em] text-primary">
            Marcas parceiras
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {brands.map((b) => (
              <Link
                key={b.id}
                to="/produtos"
                search={{ q: "", cat: "", marca: b.name }}
                className="rounded-md border border-border px-5 py-3 font-display text-sm uppercase tracking-wide text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:text-primary"
              >
                {b.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
