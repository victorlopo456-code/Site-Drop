import type { Product } from "@/lib/catalog";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
    ...(product.variants ?? []).flatMap((variant) => [variant.size, variant.color]),
  ].map(normalize);
  const words = fields.flatMap((field) => field.split(" "));
  const terms = normalize(query).split(" ").filter(Boolean);
  if (!terms.length) return 0;
  let score = 0;
  for (const term of terms) {
    if (fields.some((field) => field === term)) score += 100;
    else if (fields.some((field) => field.startsWith(term))) score += 70;
    else if (fields.some((field) => field.includes(term))) score += 50;
    else if (
      term.length >= 3 &&
      words.some((word) => editDistance(word, term) <= (term.length >= 7 ? 2 : 1))
    )
      score += 25;
    else return -1;
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
