import { useSyncExternalStore } from "react";
import {
  products as baseProducts,
  totalStock,
  type Product,
  type Promotion,
  type Variant,
} from "@/lib/catalog";
import {
  createProductInSupabase,
  deleteProductInSupabase,
  loadCatalogFromSupabase,
  updateProductInSupabase,
} from "@/lib/catalog-supabase";
import { getSupabaseBrowserClient } from "@/lib/supabase";

let current: Product[] = applySchedules(baseProducts);
let hydrated = false;
let timer: ReturnType<typeof setInterval> | null = null;
let remoteLoadStarted = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

async function hydrateRemote() {
  if (remoteLoadStarted) return;
  remoteLoadStarted = true;
  try {
    const products = await loadCatalogFromSupabase();
    if (products) {
      current = applySchedules(products);
      emit();
    }
  } finally {
    remoteLoadStarted = false;
  }
}

export function isPromotionActive(promo: Promotion | undefined, now = new Date()) {
  if (!promo || !promo.percent) return false;
  const day = now.toISOString().slice(0, 10);
  if (promo.start && day < promo.start) return false;
  if (promo.end && day > promo.end) return false;
  return true;
}

function applySchedules(list: Product[], now = new Date()): Product[] {
  return list.map((product) => {
    const base = product.basePrice ?? product.compareAt ?? product.price;
    const tags = product.tags.filter((tag) => tag !== "promocoes");
    const stock = totalStock(product);
    if (isPromotionActive(product.promotion, now)) {
      const percent = Math.min(Math.max(product.promotion!.percent, 1), 90);
      return {
        ...product,
        basePrice: base,
        price: Number((base * (1 - percent / 100)).toFixed(2)),
        compareAt: base,
        stock,
        tags: [...tags, "promocoes"] as Product["tags"],
      };
    }
    return { ...product, basePrice: base, price: base, compareAt: undefined, stock, tags };
  });
}

function refreshSchedules() {
  const next = applySchedules(current);
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    current = next;
    emit();
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  // O Supabase é a única fonte de verdade; a cópia do navegador não restaura o catálogo.
  void hydrateRemote();
  window.addEventListener("focus", () => void hydrateRemote());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void hydrateRemote();
  });
  getSupabaseBrowserClient()?.auth.onAuthStateChange(() => {
    // Recarrega custos privados ao entrar/sair da administração sem bloquear
    // o callback interno de autenticação do Supabase.
    window.setTimeout(() => void hydrateRemote(), 0);
  });
  if (!timer) {
    timer = setInterval(() => {
      refreshSchedules();
      void hydrateRemote();
    }, 60_000);
  }
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProducts(): Product[] {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => baseProducts,
  );
}

export function getCurrentProduct(id: string) {
  return current.find((product) => product.id === id);
}

export async function refreshProducts() {
  await hydrateRemote();
}

export async function importProductsFromThisBrowser() {
  let cached: unknown;
  try {
    cached = JSON.parse(localStorage.getItem("drop-catalog-v2") ?? "[]");
  } catch {
    throw new Error("A cópia antiga deste navegador está danificada.");
  }
  if (!Array.isArray(cached)) throw new Error("Nenhum catálogo antigo encontrado.");

  const existingSkus = new Set(current.map((product) => product.sku.toLowerCase()));
  const existingSlugs = new Set(current.map((product) => product.slug.toLowerCase()));
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const value of cached) {
    if (!value || typeof value !== "object") {
      skipped += 1;
      continue;
    }
    const product = value as Product;
    if (
      typeof product.name !== "string" ||
      typeof product.sku !== "string" ||
      typeof product.slug !== "string" ||
      !Array.isArray(product.images) ||
      !Array.isArray(product.tags) ||
      !Array.isArray(product.specs)
    ) {
      skipped += 1;
      continue;
    }
    const sku = product.sku.trim().toLowerCase();
    if (!sku || existingSkus.has(sku)) {
      skipped += 1;
      continue;
    }
    const id = crypto.randomUUID();
    const slugBase = product.slug.trim().toLowerCase();
    const slug = existingSlugs.has(slugBase) ? `${slugBase}-${id.slice(0, 8)}` : slugBase;
    try {
      await createProductInSupabase({ ...product, id, slug });
      existingSkus.add(sku);
      existingSlugs.add(slug);
      imported += 1;
    } catch {
      failed += 1;
    }
  }
  await hydrateRemote();
  return { imported, skipped, failed };
}

export async function addProduct(product: Product) {
  await createProductInSupabase(product);
  current = applySchedules([product, ...current.filter((item) => item.id !== product.id)]);
  emit();
}

export async function removeProduct(id: string) {
  await deleteProductInSupabase(id);
  current = current.filter((product) => product.id !== id);
  emit();
}

export async function updateProduct(id: string, patch: Partial<Product>) {
  const product = current.find((item) => item.id === id);
  if (!product) throw new Error("Produto não encontrado.");
  const updated = applySchedules([{ ...product, ...patch }])[0];
  await updateProductInSupabase(updated);
  current = current.map((item) => (item.id === id ? updated : item));
  emit();
}

export async function setStock(id: string, stock: number) {
  const value = Math.max(0, Math.floor(stock) || 0);
  const product = current.find((item) => item.id === id);
  if (!product || product.variants?.length) return;
  await updateProduct(id, { stock: value });
}

export async function setVariantStock(id: string, variantId: string, stock: number) {
  const value = Math.max(0, Math.floor(stock) || 0);
  const product = current.find((item) => item.id === id);
  if (!product) throw new Error("Produto não encontrado.");
  await updateProduct(id, {
    variants: (product.variants ?? []).map((variant) =>
      variant.id === variantId ? { ...variant, stock: value } : variant,
    ),
  });
}

export async function setVariants(id: string, variants: Variant[]) {
  await updateProduct(id, { variants });
}

export async function decrementStock(entries: { id: string; qty: number }[]) {
  let next = current;
  for (const { id, qty } of entries) {
    next = next.map((product) => {
      if (product.id !== id) return product;
      if (product.variants?.length) {
        let left = qty;
        const variants = product.variants.map((variant) => {
          const take = Math.min(variant.stock, left);
          left -= take;
          return { ...variant, stock: variant.stock - take };
        });
        return { ...product, variants };
      }
      return { ...product, stock: Math.max(0, product.stock - qty) };
    });
  }
  const changed = next.filter((product) => entries.some((entry) => entry.id === product.id));
  await Promise.all(changed.map((product) => updateProductInSupabase(product)));
  current = applySchedules(next);
  emit();
}

export async function schedulePromotion(id: string, promotion: Promotion | null) {
  await updateProduct(id, { promotion: promotion ?? undefined });
}

export function nextProductId() {
  return crypto.randomUUID();
}
