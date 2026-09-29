import type { Product } from "@/lib/catalog";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const synonyms: Record<string, string[]> = {
  camisa: ["camiseta"],
  camisetas: ["camiseta"],
  blusa: ["moletom"],
  casaco: ["moletom"],
  skate: ["shape"],
  shapes: ["shape"],
  sapato: ["tenis"],
  calcado: ["tenis"],
  eixo: ["truck"],
  trucks: ["truck"],
  roda: ["rodas"],
};

function expandTerms(query: string) {
  return normalize(query)
    .split(" ")
    .filter(Boolean)
    .map((term) => [term, ...(synonyms[term] ?? [])]);
}

function editDistance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length];
}

function productScore(product: Product, query: string) {
  const fields = [
    product.name,
    product.brand,
    product.category,
    product.sku,
    product.id,
    product.description,
    ...product.tags,
    ...product.specs.flatMap((spec) => [spec.label, spec.value]),
    ...(product.variants ?? []).flatMap((variant) => [variant.size, variant.color]),
  ].map(normalize);
  const words = fields.flatMap((field) => field.split(" "));
  const termGroups = expandTerms(query);
  if (!termGroups.length) return 0;
  let score = 0;
  for (const alternatives of termGroups) {
    const alternativeScores = alternatives.map((term) => {
      if (fields.some((field) => field === term)) return 100;
      if (fields.some((field) => field.startsWith(term))) return 70;
      if (fields.some((field) => field.includes(term))) return 50;
      if (
        term.length >= 3 &&
        words.some((word) => editDistance(word, term) <= (term.length >= 7 ? 2 : 1))
      )
        return 25;
      return -1;
    });
    const best = Math.max(...alternativeScores);
    if (best < 0) return -1;
    score += best;
  }
  if (normalize(product.name).includes(normalize(query))) score += 40;
  if (product.soldOut) score -= 5;
  return score;
}

export function smartSearchProducts(products: Product[], query: string, limit?: number) {
  const ranked = products
    .map((product) => ({ product, score: productScore(product, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || right.product.rating - left.product.rating)
    .map((entry) => entry.product);
  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}
