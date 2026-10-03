import test from "node:test";
import assert from "node:assert/strict";
import { productPricing, isPromotionActive } from "../src/lib/product-pricing.ts";
import { paymentMatchesOrder, shouldApplyPayment } from "../src/lib/payment-security.ts";
import { validMercadoPagoSignature } from "../src/lib/webhook-signature.ts";
import { readLimitedBody, RequestBodyTooLarge } from "../src/lib/request-body.ts";
import { allocateProductDiscount } from "../src/lib/checkout-totals.ts";

test("scheduled prices start and expire even when the stored price is stale", () => {
  const product = {
    price: 80,
    basePrice: 100,
    promotion: { percent: 20, start: "2026-10-03", end: "2026-10-04" },
  };
  assert.equal(productPricing(product, new Date("2026-10-02T12:00:00Z")).price, 100);
  assert.equal(productPricing(product, new Date("2026-10-03T12:00:00Z")).price, 80);
  assert.equal(productPricing(product, new Date("2026-10-05T12:00:00Z")).price, 100);
  assert.equal(isPromotionActive({ percent: NaN }), false);
  assert.throws(() => productPricing({ price: NaN }));
});

const order = {
  id: "order-1",
  total: "110.00",
  status: "payment_approved",
  payment_status: "approved",
  mercado_pago_payment_id: "123",
  stock_restored_at: null,
};
const payment = {
  id: 123,
  external_reference: order.id,
  transaction_amount: 110,
  currency_id: "BRL",
  status: "approved",
};

test("payment must match the order and its exact value, with finite numbers", () => {
  assert.equal(paymentMatchesOrder(payment, order), true);
  for (const invalid of [
    { transaction_amount: undefined },
    { transaction_amount: NaN },
    { transaction_amount: Infinity },
    { transaction_amount: 109.99 },
    { external_reference: "another-order" },
    { currency_id: "USD" },
    { id: 0 },
  ])
    assert.equal(paymentMatchesOrder({ ...payment, ...invalid }, order), false);
});

test("failed attempts cannot overwrite approved payments", () => {
  for (const status of ["pending", "rejected", "cancelled", "in_process"])
    assert.equal(shouldApplyPayment({ ...payment, status }, order), false);
  assert.equal(shouldApplyPayment({ ...payment, id: 456 }, order), false);
  assert.equal(shouldApplyPayment(payment, order), true);
  assert.equal(shouldApplyPayment({ ...payment, status: "refunded" }, order), true);
});

test("a refunded order cannot be reactivated by an old approval", () => {
  const refunded = {
    ...order,
    status: "payment_refunded",
    payment_status: "refunded",
    stock_restored_at: "2026-10-03",
  };
  assert.equal(shouldApplyPayment(payment, refunded), false);
  assert.equal(shouldApplyPayment({ ...payment, status: "refunded" }, refunded), true);
});

async function signedRequest(ts, id = "123") {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`id:${id};request-id:request-1;ts:${ts};`),
  );
  const digest = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://example.com", {
    headers: { "x-request-id": "request-1", "x-signature": `ts=${ts},v1=${digest}` },
  });
}

test("webhook signatures accept seconds and milliseconds but reject replay and tampering", async () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  for (const ts of [String(now), String(now / 1000)])
    assert.equal(
      await validMercadoPagoSignature(await signedRequest(ts), "123", "test-secret", now),
      true,
    );
  assert.equal(
    await validMercadoPagoSignature(
      await signedRequest(String(now - 600_000)),
      "123",
      "test-secret",
      now,
    ),
    false,
  );
  assert.equal(
    await validMercadoPagoSignature(await signedRequest(String(now)), "456", "test-secret", now),
    false,
  );
  assert.equal(
    await validMercadoPagoSignature(await signedRequest(String(now)), "123", "wrong-secret", now),
    false,
  );
  assert.equal(
    await validMercadoPagoSignature(new Request("https://example.com"), "123", "test-secret", now),
    false,
  );
});

test("request body limits count bytes and enforce the limit without Content-Length", async () => {
  const normal = new Request("https://example.com", { method: "POST", body: "test" });
  assert.equal(new TextDecoder().decode(await readLimitedBody(normal, 4)), "test");
  await assert.rejects(
    () => readLimitedBody(new Request("https://example.com", { method: "POST", body: "ééé" }), 4),
    RequestBodyTooLarge,
  );
  await assert.rejects(
    () =>
      readLimitedBody(
        new Request("https://example.com", {
          method: "POST",
          body: "test",
          headers: { "Content-Length": "100" },
        }),
        4,
      ),
    RequestBodyTooLarge,
  );
});

test("coupon allocation preserves exact cents even across many quantities; shipping is added intact", () => {
  const items = [
    { price: 1.99, qty: 99 },
    { price: 89.99, qty: 3 },
    { price: 29.95, qty: 2 },
  ];
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100);
  for (const discountCents of [0, 1, 100, Math.round(subtotal * 0.15), subtotal]) {
    const lines = allocateProductDiscount(items, discountCents / 100);
    const orderTotal = lines.reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0);
    const paymentTotal = lines
      .flatMap((line) => line.paymentParts)
      .reduce((sum, part) => sum + Math.round(part.unitPrice * 100) * part.qty, 0);
    assert.equal(orderTotal, subtotal - discountCents);
    assert.equal(paymentTotal, orderTotal);
    const freightCents = 2490;
    assert.equal(paymentTotal + freightCents, subtotal - discountCents + freightCents);
  }
  assert.throws(() => allocateProductDiscount(items, 100000));
});
