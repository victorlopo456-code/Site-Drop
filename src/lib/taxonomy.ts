import { useSyncExternalStore } from "react";
import {
  brands as defaultBrandNames,
  categories as defaultCategories,
  imageFor,
} from "@/lib/catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type CategoryGroup = "Skate" | "Vestuário" | "Acessórios";
export type ManagedCategory = {
  slug: string;
  name: string;
  group: CategoryGroup;
  image: string;
  position: number;
  enabled: boolean;
};
export type ManagedBrand = {
  id: string;
  name: string;
  position: number;
  enabled: boolean;
};

const fallbackCategories: ManagedCategory[] = defaultCategories.map((category, position) => ({
  ...category,
  position,
  enabled: true,
}));
const fallbackBrands: ManagedBrand[] = defaultBrandNames.map((name, position) => ({
  id: `fallback-${position}`,
  name,
  position,
  enabled: true,
}));

const fallbackState = { categories: fallbackCategories, brands: fallbackBrands };
let current = fallbackState;
let loading: Promise<void> | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function resolveCategoryImage(value: string, slug: string) {
  return value.startsWith("category:") ? imageFor(value.slice(9)) : value || imageFor(slug);
}

function storeCategoryImage(value: string) {
  const bundled = defaultCategories.find((category) => category.image === value);
  return bundled ? `category:${bundled.slug}` : value;
}

export async function refreshTaxonomy() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const [categoriesResult, brandsResult] = await Promise.all([
    supabase.from("product_categories").select("*").order("position").order("name"),
    supabase.from("product_brands").select("*").order("position").order("name"),
  ]);
  if (categoriesResult.error || brandsResult.error) return;
  current = {
    categories: (categoriesResult.data ?? []).map((row) => ({
      slug: row.slug,
      name: row.name,
      group: row.group_name as CategoryGroup,
      image: resolveCategoryImage(row.image_url, row.slug),
      position: row.position,
      enabled: row.enabled,
    })),
    brands: (brandsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      enabled: row.enabled,
    })),
  };
  loaded = true;
  emit();
}

function ensureLoaded() {
  if (!loaded && !loading && typeof window !== "undefined") {
    loading = refreshTaxonomy().finally(() => {
      loading = null;
    });
  }
}

export function useTaxonomy() {
  return useSyncExternalStore(
    (listener) => {
      ensureLoaded();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => fallbackState,
  );
}

export const slugifyTaxonomy = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function requireClient() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase;
}

export async function saveManagedCategory(category: ManagedCategory, originalSlug?: string) {
  const supabase = await requireClient();
  const row = {
    slug: category.slug,
    name: category.name.trim(),
    group_name: category.group,
    image_url: storeCategoryImage(category.image.trim()),
    position: category.position,
    enabled: category.enabled,
    updated_at: new Date().toISOString(),
  };
  const operation = originalSlug
    ? supabase.from("product_categories").update(row).eq("slug", originalSlug)
    : supabase.from("product_categories").insert(row);
  const { error } = await operation;
  if (error) throw new Error(error.message);
  await refreshTaxonomy();
}

export async function deleteManagedCategory(slug: string) {
  const supabase = await requireClient();
  const { error } = await supabase.from("product_categories").delete().eq("slug", slug);
  if (error)
    throw new Error(
      error.code === "23503" ? "Esta categoria está sendo usada por produtos." : error.message,
    );
  await refreshTaxonomy();
}

export async function saveManagedBrand(brand: ManagedBrand, originalId?: string) {
  const supabase = await requireClient();
  const row = {
    name: brand.name.trim(),
    position: brand.position,
    enabled: brand.enabled,
    updated_at: new Date().toISOString(),
  };
  const operation = originalId
    ? supabase.from("product_brands").update(row).eq("id", originalId)
    : supabase.from("product_brands").insert(row);
  const { error } = await operation;
  if (error) throw new Error(error.message);
  await refreshTaxonomy();
}

export async function deleteManagedBrand(id: string) {
  const supabase = await requireClient();
  const { error } = await supabase.from("product_brands").delete().eq("id", id);
  if (error)
    throw new Error(
      error.code === "23503" ? "Esta marca está sendo usada por produtos." : error.message,
    );
  await refreshTaxonomy();
}
