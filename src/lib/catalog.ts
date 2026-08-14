import shapesImg from "@/assets/cat-shapes.jpg";
import rodasImg from "@/assets/cat-rodas.jpg";
import trucksImg from "@/assets/cat-trucks.jpg";
import tenisImg from "@/assets/cat-tenis.jpg";
import camisetasImg from "@/assets/cat-camisetas.jpg";
import moletonsImg from "@/assets/cat-moletons.jpg";

export type Category = {
  slug: string;
  name: string;
  image: string;
  group: "Skate" | "Vestuário" | "Acessórios";
};

export const categories: Category[] = [
  { slug: "shapes", name: "Shapes", image: shapesImg, group: "Skate" },
  { slug: "rodas", name: "Rodas", image: rodasImg, group: "Skate" },
  { slug: "trucks", name: "Trucks", image: trucksImg, group: "Skate" },
  { slug: "rolamentos", name: "Rolamentos", image: rodasImg, group: "Skate" },
  { slug: "lixas", name: "Lixas", image: shapesImg, group: "Skate" },
  { slug: "parafusos", name: "Parafusos", image: trucksImg, group: "Skate" },
  { slug: "tenis", name: "Tênis", image: tenisImg, group: "Vestuário" },
  { slug: "camisetas", name: "Camisetas", image: camisetasImg, group: "Vestuário" },
  { slug: "moletons", name: "Moletons", image: moletonsImg, group: "Vestuário" },
  { slug: "bones", name: "Bonés", image: camisetasImg, group: "Vestuário" },
  { slug: "mochilas", name: "Mochilas", image: moletonsImg, group: "Acessórios" },
  { slug: "acessorios", name: "Acessórios", image: trucksImg, group: "Acessórios" },
];

export const brands = [
  "Vans",
  "Nike SB",
  "Adidas",
  "DC",
  "Independent",
  "Santa Cruz",
  "Element",
  "Bones",
  "Creature",
  "Future",
  "Primitive",
];

export type Variant = {
  id: string;
  size: string;
  color: string;
  stock: number;
};

/** Promoção agendada por período de datas (ISO yyyy-mm-dd). */
export type Promotion = {
  percent: number;
  start?: string;
  end?: string;
};

export type Product = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  /** Preço cheio de referência, usado para calcular promoções. */
  basePrice?: number;
  compareAt?: number;
  rating: number;
  reviews: number;
  stock: number;
  /** Indisponibilidade manual sem apagar o estoque ou ocultar o produto. */
  soldOut?: boolean;
  variants?: Variant[];
  promotion?: Promotion;
  images: string[];
  description: string;
  specs: { label: string; value: string }[];
  tags: ("mais-vendidos" | "lancamentos" | "promocoes")[];
  shipping?: {
    weightKg: number;
    widthCm: number;
    heightCm: number;
    lengthCm: number;
  };
};

export const imageFor = (slug: string) =>
  categories.find((c) => c.slug === slug)?.image ?? shapesImg;

type Seed = {
  name: string;
  brand: string;
  category: string;
  price: number;
  compareAt?: number;
  rating: number;
  reviews: number;
  stock: number;
  tags: Product["tags"];
};

const seeds: Seed[] = [
  {
    name: 'Shape Maple Pro 8.0" Team Series',
    brand: "Santa Cruz",
    category: "shapes",
    price: 349.9,
    compareAt: 429.9,
    rating: 4.8,
    reviews: 214,
    stock: 18,
    tags: ["mais-vendidos", "promocoes"],
  },
  {
    name: 'Shape Street Classic 8.25"',
    brand: "Element",
    category: "shapes",
    price: 389.9,
    rating: 4.7,
    reviews: 132,
    stock: 12,
    tags: ["lancamentos"],
  },
  {
    name: 'Shape Bowl Killer 8.5"',
    brand: "Creature",
    category: "shapes",
    price: 419.9,
    compareAt: 489.9,
    rating: 4.9,
    reviews: 88,
    stock: 7,
    tags: ["promocoes"],
  },
  {
    name: "Rodas 54mm 99A Street Formula",
    brand: "Bones",
    category: "rodas",
    price: 279.9,
    rating: 4.9,
    reviews: 341,
    stock: 40,
    tags: ["mais-vendidos"],
  },
  {
    name: "Rodas 52mm 101A Park",
    brand: "Future",
    category: "rodas",
    price: 189.9,
    compareAt: 239.9,
    rating: 4.6,
    reviews: 96,
    stock: 25,
    tags: ["promocoes"],
  },
  {
    name: "Rodas 56mm Cruiser Soft 78A",
    brand: "Santa Cruz",
    category: "rodas",
    price: 229.9,
    rating: 4.5,
    reviews: 61,
    stock: 30,
    tags: ["lancamentos"],
  },
  {
    name: "Truck Stage 11 Forged Hollow 139",
    brand: "Independent",
    category: "trucks",
    price: 649.9,
    compareAt: 749.9,
    rating: 5.0,
    reviews: 178,
    stock: 9,
    tags: ["mais-vendidos", "promocoes"],
  },
  {
    name: "Truck Polido 149 Standard",
    brand: "Independent",
    category: "trucks",
    price: 489.9,
    rating: 4.8,
    reviews: 120,
    stock: 14,
    tags: [],
  },
  {
    name: "Rolamentos Reds Precision",
    brand: "Bones",
    category: "rolamentos",
    price: 199.9,
    rating: 4.9,
    reviews: 402,
    stock: 55,
    tags: ["mais-vendidos"],
  },
  {
    name: "Rolamentos Swiss Ceramic",
    brand: "Bones",
    category: "rolamentos",
    price: 749.9,
    rating: 5.0,
    reviews: 44,
    stock: 4,
    tags: ["lancamentos"],
  },
  {
    name: "Lixa Perfurada Black Grip",
    brand: "Future",
    category: "lixas",
    price: 59.9,
    compareAt: 79.9,
    rating: 4.4,
    reviews: 210,
    stock: 80,
    tags: ["promocoes"],
  },
  {
    name: 'Kit Parafusos Allen 1"',
    brand: "Independent",
    category: "parafusos",
    price: 39.9,
    rating: 4.6,
    reviews: 150,
    stock: 120,
    tags: [],
  },
  {
    name: "Tênis Skate Pro Suede Preto",
    brand: "Vans",
    category: "tenis",
    price: 599.9,
    compareAt: 699.9,
    rating: 4.8,
    reviews: 512,
    stock: 22,
    tags: ["mais-vendidos", "promocoes"],
  },
  {
    name: "Tênis SB Low Court Black",
    brand: "Nike SB",
    category: "tenis",
    price: 799.9,
    rating: 4.9,
    reviews: 288,
    stock: 16,
    tags: ["lancamentos"],
  },
  {
    name: "Tênis Court Skate Grafite",
    brand: "Adidas",
    category: "tenis",
    price: 549.9,
    rating: 4.6,
    reviews: 173,
    stock: 20,
    tags: [],
  },
  {
    name: "Tênis DC Court Vulc Full Black",
    brand: "DC",
    category: "tenis",
    price: 479.9,
    compareAt: 559.9,
    rating: 4.5,
    reviews: 96,
    stock: 18,
    tags: ["promocoes"],
  },
  {
    name: "Camiseta Oversized Urban Drop",
    brand: "Primitive",
    category: "camisetas",
    price: 159.9,
    rating: 4.7,
    reviews: 240,
    stock: 60,
    tags: ["mais-vendidos"],
  },
  {
    name: "Camiseta Heavy Cotton Logo",
    brand: "Element",
    category: "camisetas",
    price: 139.9,
    compareAt: 179.9,
    rating: 4.5,
    reviews: 130,
    stock: 45,
    tags: ["promocoes"],
  },
  {
    name: "Camiseta Graphic Skull Tour",
    brand: "Creature",
    category: "camisetas",
    price: 169.9,
    rating: 4.6,
    reviews: 74,
    stock: 33,
    tags: ["lancamentos"],
  },
  {
    name: "Moletom Hoodie Heavy Grafite",
    brand: "Primitive",
    category: "moletons",
    price: 389.9,
    compareAt: 469.9,
    rating: 4.8,
    reviews: 188,
    stock: 15,
    tags: ["mais-vendidos", "promocoes"],
  },
  {
    name: "Moletom Zip Street Black",
    brand: "Vans",
    category: "moletons",
    price: 429.9,
    rating: 4.7,
    reviews: 92,
    stock: 11,
    tags: ["lancamentos"],
  },
  {
    name: "Boné Snapback Ember",
    brand: "Nike SB",
    category: "bones",
    price: 179.9,
    rating: 4.6,
    reviews: 141,
    stock: 38,
    tags: [],
  },
  {
    name: "Mochila Skate Carry 28L",
    brand: "Element",
    category: "mochilas",
    price: 329.9,
    compareAt: 399.9,
    rating: 4.7,
    reviews: 87,
    stock: 19,
    tags: ["promocoes"],
  },
  {
    name: "Kit Ferramenta Skate All-in-One",
    brand: "Independent",
    category: "acessorios",
    price: 129.9,
    rating: 4.8,
    reviews: 205,
    stock: 50,
    tags: ["mais-vendidos"],
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const APPAREL = ["tenis", "camisetas", "moletons", "bones"];

function variantsFor(category: string, stock: number, index: number): Variant[] {
  const sizes = APPAREL.includes(category)
    ? category === "tenis"
      ? ["38", "39", "40", "41", "42"]
      : ["P", "M", "G", "GG"]
    : ["Único"];
  const color = ["Preto", "Grafite", "Branco"][index % 3];
  const each = Math.max(0, Math.floor(stock / sizes.length));
  return sizes.map((size, i) => ({
    id: `${index}-${i}`,
    size,
    color,
    stock: i === 0 ? stock - each * (sizes.length - 1) : each,
  }));
}

export const products: Product[] = seeds.map((seed, index) => {
  const image = imageFor(seed.category);
  return {
    id: String(index + 1),
    sku: `DRP-${String(index + 1).padStart(4, "0")}`,
    slug: slugify(seed.name),
    name: seed.name,
    brand: seed.brand,
    category: seed.category,
    price: seed.price,
    basePrice: seed.compareAt ?? seed.price,
    compareAt: seed.compareAt,
    rating: seed.rating,
    reviews: seed.reviews,
    stock: seed.stock,
    variants: variantsFor(seed.category, seed.stock, index + 1),
    promotion: seed.compareAt
      ? { percent: Math.round((1 - seed.price / seed.compareAt) * 100) }
      : undefined,
    images: [image, imageFor(seed.category), image],

    description:
      `${seed.name} da ${seed.brand}, selecionado pela curadoria DROP Skate Shop. ` +
      "Construção durável para street e park, acabamento premium e performance testada por skatistas. " +
      "Produto original com garantia e envio para todo o Brasil.",
    specs: [
      { label: "Marca", value: seed.brand },
      { label: "SKU", value: `DRP-${String(index + 1).padStart(4, "0")}` },
      { label: "Garantia", value: "3 meses contra defeito de fabricação" },
      { label: "Origem", value: "Produto original importado/nacional" },
    ],
    tags: seed.tags,
  };
});

export const getProduct = (slug: string) => products.find((p) => p.slug === slug);

export const byTag = (tag: Product["tags"][number]) => products.filter((p) => p.tags.includes(tag));

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const discountPercent = (p: Product) =>
  p.compareAt ? Math.round((1 - p.price / p.compareAt) * 100) : 0;

export function searchProducts(query: string, limit = 8): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return products
    .filter((p) =>
      [p.name, p.brand, p.category, p.sku, p.id].some((field) => field.toLowerCase().includes(q)),
    )
    .slice(0, limit);
}

/** Estoque total considerando variações quando existirem. */
export const totalStock = (p: Product) =>
  p.variants && p.variants.length
    ? p.variants.reduce((acc, v) => acc + Math.max(0, v.stock), 0)
    : Math.max(0, p.stock);

export const isOutOfStock = (p: Product) => Boolean(p.soldOut) || totalStock(p) <= 0;
