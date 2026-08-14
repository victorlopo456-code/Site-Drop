import { useSyncExternalStore } from "react";
import {
  products as baseProducts,
  totalStock,
  type Product,
  type Promotion,
  type Variant,
} from "@/lib/catalog";
import { loadCatalogFromSupabase, saveCatalogToSupabase } from "@/lib/catalog-supabase";

const KEY = "drop-catalog-v2";

let current: Product[] = applySchedules(baseProducts);
let hydrated = false;
let timer: ReturnType<typeof setInterval> | null = null;
let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let remoteLoadStarted = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
}

function scheduleRemoteSave() {
  if (typeof window === "undefined") return;
  if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(() => {
    remoteSaveTimer = null;
    void saveCatalogToSupabase(current);
  }, 800);
}

async function hydrateRemote() {
  if (remoteLoadStarted) return;
  remoteLoadStarted = true;
  const products = await loadCatalogFromSupabase();
  if (products?.length) {
    current = applySchedules(products);
    persist();
    emit();
    return;
  }

  // Se a tabela estiver vazia, a primeira visita de um admin envia o catálogo inicial.
  if (products && products.length === 0) await saveCatalogToSupabase(current);
}

/** Verdadeiro quando a promoção está dentro da janela de datas agendada. */
export function isPromotionActive(promo: Promotion | undefined, now = new Date()) {
  if (!promo || !promo.percent) return false;
  const day = now.toISOString().slice(0, 10);
  if (promo.start && day < promo.start) return false;
  if (promo.end && day > promo.end) return false;
  return true;
}

/** Recalcula preço, comparativo e tag de promoção conforme o agendamento. */
function applySchedules(list: Product[], now = new Date()): Product[] {
  return list.map((p) => {
    const base = p.basePrice ?? p.compareAt ?? p.price;
    const tags = p.tags.filter((t) => t !== "promocoes");
    const stock = totalStock(p);
    if (isPromotionActive(p.promotion, now)) {
      const percent = Math.min(Math.max(p.promotion!.percent, 1), 90);
      return {
        ...p,
        basePrice: base,
        price: Number((base * (1 - percent / 100)).toFixed(2)),
        compareAt: base,
        stock,
        tags: [...tags, "promocoes"] as Product["tags"],
      };
    }
    return { ...p, basePrice: base, price: base, compareAt: undefined, stock, tags };
  });
}

function refresh() {
  const next = applySchedules(current);
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  current = next;
  if (changed) emit();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Product[];
      if (Array.isArray(parsed) && parsed.length) {
        current = applySchedules(parsed);
        emit();
      }
    }
  } catch {
    /* ignore */
  }
  void hydrateRemote();
  if (!timer) timer = setInterval(refresh, 60_000);
}

function commit(next: Product[]) {
  current = applySchedules(next);
  persist();
  emit();
  scheduleRemoteSave();
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
  return current.find((p) => p.id === id);
}

export function addProduct(product: Product) {
  commit([product, ...current]);
}

export function removeProduct(id: string) {
  commit(current.filter((p) => p.id !== id));
}

export function updateProduct(id: string, patch: Partial<Product>) {
  commit(current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

/** Define o estoque simples de um produto (sem variações). */
export function setStock(id: string, stock: number) {
  const value = Math.max(0, Math.floor(stock) || 0);
  commit(
    current.map((p) =>
      p.id === id ? (p.variants && p.variants.length ? p : { ...p, stock: value }) : p,
    ),
  );
}

/** Define o estoque de uma variação (tamanho/cor) específica. */
export function setVariantStock(id: string, variantId: string, stock: number) {
  const value = Math.max(0, Math.floor(stock) || 0);
  commit(
    current.map((p) =>
      p.id === id
        ? {
            ...p,
            variants: (p.variants ?? []).map((v) =>
              v.id === variantId ? { ...v, stock: value } : v,
            ),
          }
        : p,
    ),
  );
}

export function setVariants(id: string, variants: Variant[]) {
  commit(current.map((p) => (p.id === id ? { ...p, variants } : p)));
}

/** Baixa de estoque após a confirmação de um pedido. */
export function decrementStock(entries: { id: string; qty: number }[]) {
  let next = current;
  for (const { id, qty } of entries) {
    next = next.map((p) => {
      if (p.id !== id) return p;
      if (p.variants && p.variants.length) {
        let left = qty;
        const variants = p.variants.map((v) => {
          const take = Math.min(v.stock, left);
          left -= take;
          return { ...v, stock: v.stock - take };
        });
        return { ...p, variants };
      }
      return { ...p, stock: Math.max(0, p.stock - qty) };
    });
  }
  commit(next);
}

/** Agenda (ou remove) uma promoção por período de datas. */
export function schedulePromotion(id: string, promotion: Promotion | null) {
  commit(current.map((p) => (p.id === id ? { ...p, promotion: promotion ?? undefined } : p)));
}

export function resetCatalog() {
  commit(baseProducts);
}

export function nextProductId() {
  const max = current.reduce((acc, p) => Math.max(acc, Number(p.id) || 0), 0);
  return String(max + 1);
}
