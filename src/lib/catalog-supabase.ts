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

function toRow(product: Product) {
  return {
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
    updated_at: new Date().toISOString(),
  };
}

async function requireCatalogClient() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase;
}

function catalogError(error: { code?: string; message: string }) {
  if (error.code === "23505") return "Já existe um produto com este SKU ou endereço.";
  return error.message;
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
  const products = (data as ProductRow[])
    .map(fromRow)
    .filter((item): item is Product => item !== null);
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return products;
  const { data: costs, error: costsError } = await supabase
    .from("product_costs")
    .select("product_id,cost_price");
  if (costsError || !costs?.length) return products;
  const costByProduct = new Map(
    costs.map((cost) => [cost.product_id as string, Number(cost.cost_price)]),
  );
  return products.map((product) => ({
    ...product,
    costPrice: costByProduct.get(product.id),
  }));
}

async function savePrivateCost(product: Product) {
  const supabase = await requireCatalogClient();
  if (product.costPrice == null) {
    const { error } = await supabase.from("product_costs").delete().eq("product_id", product.id);
    if (error) throw new Error("Não foi possível remover o preço de custo.");
    return;
  }
  const { error } = await supabase.from("product_costs").upsert(
    {
      product_id: product.id,
      cost_price: product.costPrice,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id" },
  );
  if (error) throw new Error("Não foi possível salvar o preço de custo.");
}

export async function createProductInSupabase(product: Product) {
  const supabase = await requireCatalogClient();
  const { error } = await supabase.from("products").insert({
    id: product.id,
    ...toRow(product),
    sort_order: 0,
    enabled: true,
  });
  if (error) throw new Error(catalogError(error));
  try {
    await savePrivateCost(product);
  } catch (costError) {
    await supabase.from("products").delete().eq("id", product.id);
    throw costError;
  }
}

export async function updateProductInSupabase(product: Product) {
  const supabase = await requireCatalogClient();
  const { data, error } = await supabase
    .from("products")
    .update(toRow(product))
    .eq("id", product.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(catalogError(error));
  if (!data) throw new Error("Produto não encontrado no banco de dados.");
  await savePrivateCost(product);
}

export async function deleteProductInSupabase(id: string) {
  const supabase = await requireCatalogClient();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Produto não encontrado no banco de dados.");
}
