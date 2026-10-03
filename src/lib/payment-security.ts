export type VerifiedPayment = {
  id: number;
  status: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string;
};

export type PaymentOrder = {
  id: string;
  total: number | string;
  status: string;
  payment_status: string;
  mercado_pago_payment_id: string | null;
  stock_restored_at: string | null;
};

export function paymentMatchesOrder(
  payment: VerifiedPayment,
  order: Pick<PaymentOrder, "id" | "total">,
) {
  const amount = Number(payment.transaction_amount);
  const total = Number(order.total);
  return (
    Number.isSafeInteger(payment.id) &&
    payment.id > 0 &&
    payment.external_reference === order.id &&
    payment.currency_id === "BRL" &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    Number.isFinite(total) &&
    total >= 0 &&
    Math.round(amount * 100) === Math.round(total * 100)
  );
}

// A rejected second attempt must never replace an approved payment, nor may
// an old approval reactivate an order whose stock has already been refunded.
export function shouldApplyPayment(payment: VerifiedPayment, order: PaymentOrder) {
  if (
    order.mercado_pago_payment_id &&
    order.mercado_pago_payment_id !== String(payment.id) &&
    ["approved", "refunded", "charged_back"].includes(order.payment_status)
  )
    return false;
  const refunded =
    order.status === "payment_refunded" ||
    order.stock_restored_at != null ||
    ["refunded", "charged_back"].includes(order.payment_status);
  if (refunded) return ["refunded", "charged_back"].includes(payment.status);
  if (order.payment_status === "approved") {
    return ["approved", "refunded", "charged_back"].includes(payment.status);
  }
  return true;
}
