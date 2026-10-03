type Promotion = { percent: number; start?: string; end?: string };

export function isPromotionActive(promo: Promotion | undefined, now = new Date()) {
  if (!promo || !Number.isFinite(promo.percent) || promo.percent <= 0) return false;
  const day = now.toISOString().slice(0, 10);
  return (!promo.start || day >= promo.start) && (!promo.end || day <= promo.end);
}

// Resolve schedules on the server as well as in the catalog. A stored price
// can be stale when a scheduled promotion starts or ends without an admin edit.
export function productPricing(
  product: {
    price: number;
    basePrice?: number;
    compareAt?: number;
    promotion?: Promotion;
  },
  now = new Date(),
) {
  const basePrice = product.basePrice ?? product.compareAt ?? product.price;
  if (!Number.isFinite(basePrice) || basePrice < 0) throw new Error("Preço de produto inválido.");
  if (isPromotionActive(product.promotion, now)) {
    const percent = Math.min(Math.max(product.promotion!.percent, 1), 90);
    return {
      basePrice,
      price: Math.round(basePrice * (1 - percent / 100) * 100) / 100,
      compareAt: basePrice,
    };
  }
  return { basePrice, price: basePrice, compareAt: undefined };
}

export function databaseProductPrice(product: {
  price: number | string;
  base_price?: number | string | null;
  compare_at?: number | string | null;
  promotion?: unknown;
}) {
  return productPricing({
    price: Number(product.price),
    basePrice: product.base_price == null ? undefined : Number(product.base_price),
    compareAt: product.compare_at == null ? undefined : Number(product.compare_at),
    promotion: product.promotion as Promotion | undefined,
  }).price;
}
