export async function validMercadoPagoSignature(
  request: Request,
  dataId: string,
  secret: string,
  now = Date.now(),
) {
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  if (
    !/^\d+$/.test(parts.ts ?? "") ||
    !/^[a-f0-9]{64}$/i.test(parts.v1 ?? "") ||
    !requestId ||
    !dataId ||
    !secret
  )
    return false;
  const timestamp = Number(parts.ts);
  if (!Number.isSafeInteger(timestamp)) return false;
  // Mercado Pago integrations may use seconds or milliseconds in x-signature.
  const timestampMs = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  if (Math.abs(now - timestampMs) > 5 * 60 * 1000) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  let difference = 0;
  const received = parts.v1.toLowerCase();
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}
