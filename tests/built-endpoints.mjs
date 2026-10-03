import assert from "node:assert/strict";
// Deliberately fake credentials: all tested requests must be rejected before
// any payment API, authentication provider or database operation is reached.
process.env.SUPABASE_SERVICE_ROLE_KEY = "audit-fake-service-key";
process.env.MERCADO_PAGO_ACCESS_TOKEN = "audit-fake-payment-key";
process.env.MERCADO_PAGO_WEBHOOK_SECRET = "audit-fake-webhook-secret";
process.env.VITE_SUPABASE_URL = "https://audit-invalid.supabase.co";
process.env.CRON_SECRET = "audit-fake-cron-secret";
const { default: app } = await import("../.vercel/output/functions/__server.func/index.mjs");
const origin = "https://audit.example.invalid";
const cases = [
  { path: "/api/mercado-pago/webhook", method: "POST", body: "null", expected: 400 },
  { path: "/api/mercado-pago/webhook", method: "POST", body: "not-json", expected: 400 },
  { path: "/api/mercado-pago/webhook", method: "POST", body: "x".repeat(32769), expected: 413 },
  {
    path: "/api/mercado-pago/webhook",
    method: "POST",
    body: JSON.stringify({ type: "payment", data: { id: "../other" } }),
    expected: 400,
  },
  {
    path: "/api/mercado-pago/webhook",
    method: "POST",
    body: JSON.stringify({ type: "payment", data: { id: "123" } }),
    expected: 401,
  },
  { path: "/api/admin/product-image", method: "POST", body: "", expected: 401 },
  { path: "/api/orders/payment-reminders", method: "GET", expected: 401 },
  { path: "/api/marketing/notifications", method: "GET", expected: 401 },
];
const realFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("A rejected audit request attempted external access");
};
try {
  for (const item of cases) {
    const response = await app.fetch(
      new Request(origin + item.path, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: item.body,
      }),
    );
    assert.equal(response.status, item.expected, `${item.path} (${item.body?.slice(0, 20)})`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(response.headers.get("content-security-policy"));
    console.log(`PASS ${item.method} ${item.path}: ${response.status}`);
  }
} finally {
  globalThis.fetch = realFetch;
}
