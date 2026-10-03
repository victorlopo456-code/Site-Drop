// Allocate a coupon in whole cents, then split payment quantities where needed
// so Mercado Pago receives the exact discounted total without rounding drift.
export function allocateProductDiscount(
  items: Array<{ price: number; qty: number }>,
  discount: number,
) {
  const gross = items.map((item) => Math.round(item.price * 100) * item.qty);
  const subtotal = gross.reduce((sum, value) => sum + value, 0);
  const discountCents = Math.round(discount * 100);
  if (
    !Number.isSafeInteger(subtotal) ||
    subtotal < 0 ||
    !Number.isSafeInteger(discountCents) ||
    discountCents < 0 ||
    discountCents > subtotal ||
    items.some(
      (item) =>
        !Number.isFinite(item.price) ||
        item.price < 0 ||
        !Number.isInteger(item.qty) ||
        item.qty < 1,
    )
  ) {
    throw new Error("Valores inválidos para o desconto.");
  }
  const target = subtotal - discountCents;
  const exact = gross.map((value) => (subtotal ? (value * target) / subtotal : 0));
  const net = exact.map(Math.floor);
  let remaining = target - net.reduce((sum, value) => sum + value, 0);
  const ranked = exact
    .map((value, index) => ({ index, remainder: value - net[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of ranked) {
    if (remaining <= 0) break;
    net[index] += 1;
    remaining -= 1;
  }
  return items.map((item, index) => {
    const low = Math.floor(net[index] / item.qty);
    const extra = net[index] % item.qty;
    return {
      unitPrice: Math.round(net[index] / item.qty) / 100,
      lineTotal: net[index] / 100,
      paymentParts: [
        { qty: item.qty - extra, unitPrice: low / 100 },
        { qty: extra, unitPrice: (low + 1) / 100 },
      ].filter((part) => part.qty > 0 && part.unitPrice > 0),
    };
  });
}
