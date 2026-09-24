import { imageFor, type Product, type Promotion, type Variant } from "@/lib/catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type ProductRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number | string;
  base_price: number | string | null;
  compare_at: number | string | null;
  rating: number | string;
  reviews: number;
  stock: number;
  sold_out: boolean | null;
  variants: unknown;
  promotion: unknown;
  images: unknown;
  description: string;
  specs: unknown;
  tags: string[];
  sort_order: number;
  weight_kg: number | string;
  width_cm: number;
  height_cm: number;
  length_cm: number;
};

const numberOrUndefined = (value: number | string | null) =>
  value == null ? undefined : Number(value);

const bundledCatalogImage = /(?:^|\/)cat-(?:shapes|rodas|trucks|tenis|camisetas|moletons)(?:[-.])/;

function decodeImageReference(value: string) {
  return value.startsWith("category:") ? imageFor(value.slice("category:".length)) : value;
}

function encodeImageReference(value: string, category: string) {
  return value === imageFor(category) || bundledCatalogImage.test(value)
    ? `category:${category}`
    : value;
}

function fromRow(row: ProductRow): Product | null {
  if (!Array.isArray(row.images) || !row.images.every((image) => typeof image === "string")) {
    return null;
  }
  const variants = Array.isArray(row.variants) ? (row.variants as Variant[]) : [];
  const specs = Array.isArray(row.specs) ? (row.specs as { label: string; value: string }[]) : [];
  const promotion =
    row.promotion && typeof row.promotion === "object" ? (row.promotion as Promotion) : undefined;
  const allowedTags = new Set(["mais-vendidos", "lancamentos", "promocoes"]);
  const tags = (row.tags ?? []).filter((tag) => allowedTags.has(tag)) as Product["tags"];

  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    price: Number(row.price),
    basePrice: numberOrUndefined(row.base_price),
    compareAt: numberOrUndefined(row.compare_at),
    rating: Number(row.rating),
    reviews: row.reviews,
    stock: row.stock,
    soldOut: Boolean(row.sold_out),
    variants,
    promotion,
    images: row.images.map(decodeImageReference),
    description: row.description,
    specs,
    tags,
    shipping: {
      weightKg: Number(row.weight_kg) || 0.5,
      widthCm: row.width_cm || 20,
      heightCm: row.height_cm || 10,
      lengthCm: row.length_cm || 30,
    },
  };
}

export const loadProductForPage = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().trim().min(1).max(200) }))
  .handler(async ({ data }) => {
    const url = process.env.VITE_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) return null;
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: row, error } = await supabase
      .from("products")
      .select("*")
      .eq("slug", data.slug)
      .eq("enabled", true)
      .maybeSingle();
    if (error || !row) return null;
    return fromRow(row as ProductRow);
  });

export async function loadCatalogFromSupabase(): Promise<Product[] | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("products").select("*").order("sort_order");
  if (error) {
    console.warn("Catálogo do Supabase indisponível:", error.message);
    return null;
  }
  return (data as ProductRow[]).map(fromRow).filter((item): item is Product => item !== null);
}

export async function saveCatalogToSupabase(products: Product[]): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return false;

  const now = new Date().toISOString();
  const rows = products.map((product, sortOrder) => ({
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: product.price,
    base_price: product.basePrice ?? null,
    compare_at: product.compareAt ?? null,
    rating: product.rating,
    reviews: product.reviews,
    stock: product.stock,
    sold_out: Boolean(product.soldOut),
    variants: product.variants ?? [],
    promotion: product.promotion ?? null,
    images: product.images.map((image) => encodeImageReference(image, product.category)),
    description: product.description,
    specs: product.specs,
    tags: product.tags,
    weight_kg: product.shipping?.weightKg ?? 0.5,
    width_cm: product.shipping?.widthCm ?? 20,
    height_cm: product.shipping?.heightCm ?? 10,
    length_cm: product.shipping?.lengthCm ?? 30,
    sort_order: sortOrder,
    enabled: true,
    updated_at: now,
    updated_by: auth.user.id,
  }));

  const { error } = await supabase.from("products").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Falha ao salvar catálogo no Supabase:", error.message);
    return false;
  }

  const { data: existing } = await supabase.from("products").select("id");
  const keep = new Set(products.map((product) => product.id));
  const removed = (existing ?? []).map((row) => row.id as string).filter((id) => !keep.has(id));
  if (removed.length) await supabase.from("products").delete().in("id", removed);
  return true;
}
