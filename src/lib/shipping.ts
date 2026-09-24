import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/server-security";

const itemsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      variantId: z.string().min(1).max(100).optional(),
      qty: z.number().int().min(1).max(99),
    }),
  )
  .min(1)
  .max(100);

const quoteSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  cep: z.string().regex(/^\d{8}$/),
  items: itemsSchema,
});

const pickupQuoteSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  items: itemsSchema,
});

export type ShippingOption = {
  id: string;
  label: string;
  company: string;
  price: number;
  days: number;
  token: string;
};

type QuotePayload = {
  serviceId: string;
  label: string;
  price: number;
  days: number;
  cep: string;
  items: string;
  expiresAt: number;
};

const money = (value: number) => Math.round(value * 100) / 100;

function itemFingerprint(items: z.infer<typeof itemsSchema>) {
  return items
    .map((item) => `${item.id}:${item.variantId ?? ""}:${item.qty}`)
    .sort()
    .join("|");
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createQuoteToken(payload: QuotePayload, secret: string) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${await signature(encoded, secret)}`;
}

export async function verifyShippingQuote(
  token: string,
  secret: string,
  cep: string,
  items: z.infer<typeof itemsSchema>,
) {
  const [encoded, receivedSignature, extra] = token.split(".");
  if (!encoded || !receivedSignature || extra) throw new Error("Cotação de frete inválida.");
  const expected = await signature(encoded, secret);
  if (expected.length !== receivedSignature.length) throw new Error("Cotação de frete inválida.");
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ receivedSignature.charCodeAt(index);
  }
  if (difference !== 0) throw new Error("Cotação de frete inválida.");
  let payload: QuotePayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as QuotePayload;
  } catch {
    throw new Error("Cotação de frete inválida.");
  }
  if (payload.expiresAt < Date.now())
    throw new Error("A cotação de frete expirou. Calcule novamente.");
  const expectedCep = payload.serviceId === "store-pickup" ? "pickup" : cep;
  if (payload.cep !== expectedCep || payload.items !== itemFingerprint(items)) {
    throw new Error("O endereço ou o carrinho mudou. Calcule o frete novamente.");
  }
  if (!Number.isFinite(payload.price) || payload.price < 0)
    throw new Error("Valor de frete inválido.");
  return payload;
}

export const quoteStorePickup = createServerFn({ method: "POST" })
  .validator(pickupQuoteSchema)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceRole) throw new Error("Backend do Supabase não configurado.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error } = await supabase.auth.getUser(data.accessToken);
    if (error || !auth.user) throw new Error("Entre na sua conta para escolher a retirada.");
    await enforceRateLimit(supabase, auth.user.id, "shipping-quote", 30, 10 * 60);

    const payload: QuotePayload = {
      serviceId: "store-pickup",
      label: "Retirar na loja",
      price: 0,
      days: 0,
      cep: "pickup",
      items: itemFingerprint(data.items),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    return {
      id: payload.serviceId,
      label: payload.label,
      company: "DROP Skate Shop",
      price: 0,
      days: 0,
      token: await createQuoteToken(payload, serviceRole),
    } satisfies ShippingOption;
  });

export const quoteShipping = createServerFn({ method: "POST" })
  .validator(quoteSchema)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceRole) throw new Error("Backend do Supabase não configurado.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await supabase.auth.getUser(data.accessToken);
    if (authError || !auth.user) throw new Error("Entre na sua conta para calcular o frete.");
    await enforceRateLimit(supabase, auth.user.id, "shipping-quote", 30, 10 * 60);

    const ids = [...new Set(data.items.map((item) => item.id))];
    const { data: products, error } = await supabase
      .from("products")
      .select("id,name,price,weight_kg,width_cm,height_cm,length_cm,enabled,sold_out")
      .in("id", ids);
    if (error || !products || products.length !== ids.length) {
      throw new Error("Não foi possível preparar a cotação dos produtos.");
    }

    const byId = new Map(products.map((product) => [String(product.id), product]));
    const subtotal = money(
      data.items.reduce((sum, item) => {
        const product = byId.get(item.id);
        if (!product || !product.enabled || product.sold_out)
          throw new Error("Produto indisponível.");
        return sum + Number(product.price) * item.qty;
      }, 0),
    );
    const fingerprint = itemFingerprint(data.items);
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const makeOption = async (option: Omit<ShippingOption, "token">): Promise<ShippingOption> => ({
      ...option,
      token: await createQuoteToken(
        {
          serviceId: option.id,
          label: option.label,
          price: subtotal >= 399 ? 0 : option.price,
          days: option.days,
          cep: data.cep,
          items: fingerprint,
          expiresAt,
        },
        serviceRole,
      ),
      price: subtotal >= 399 ? 0 : option.price,
    });

    const melhorEnvioToken = process.env.MELHOR_ENVIO_TOKEN?.trim();
    const fromPostalCode = process.env.MELHOR_ENVIO_FROM_POSTAL_CODE?.replace(/\D/g, "");
    if (!melhorEnvioToken || !/^\d{8}$/.test(fromPostalCode ?? "")) {
      return {
        live: false,
        message: "Cotação estimada: configure o Melhor Envio para obter valores reais.",
        options: await Promise.all([
          makeOption({
            id: "estimate-pac",
            label: "Correios PAC (estimativa)",
            company: "Correios",
            price: 24.9,
            days: 9,
          }),
          makeOption({
            id: "estimate-sedex",
            label: "Correios SEDEX (estimativa)",
            company: "Correios",
            price: 44.9,
            days: 3,
          }),
        ]),
      };
    }

    const endpoint =
      process.env.MELHOR_ENVIO_SANDBOX === "false"
        ? "https://melhorenvio.com.br/api/v2/me/shipment/calculate"
        : "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${melhorEnvioToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          process.env.MELHOR_ENVIO_USER_AGENT?.trim() ||
          "DROP Skate Shop (contato@dropskateshop.com.br)",
      },
      body: JSON.stringify({
        from: { postal_code: fromPostalCode },
        to: { postal_code: data.cep },
        products: data.items.map((item) => {
          const product = byId.get(item.id)!;
          return {
            id: item.id,
            width: Number(product.width_cm),
            height: Number(product.height_cm),
            length: Number(product.length_cm),
            weight: Number(product.weight_kg),
            insurance_value: money(Number(product.price)),
            quantity: item.qty,
          };
        }),
        options: { receipt: false, own_hand: false },
      }),
    });
    if (!response.ok) throw new Error("O Melhor Envio não conseguiu calcular este frete.");
    const result = (await response.json()) as Array<Record<string, unknown>>;
    const valid = result.filter(
      (option) => !option.error && Number(option.custom_price ?? option.price) >= 0,
    );
    const options = await Promise.all(
      valid.slice(0, 8).map((option) => {
        const company = (option.company ?? {}) as { name?: string };
        return makeOption({
          id: `melhor-envio-${String(option.id)}`,
          label: `${company.name ? `${company.name} ` : ""}${String(option.name ?? "Entrega")}`,
          company: company.name ?? "Transportadora",
          price: money(Number(option.custom_price ?? option.price)),
          days: Math.max(1, Number(option.custom_delivery_time ?? option.delivery_time) || 1),
        });
      }),
    );
    if (!options.length) throw new Error("Nenhuma transportadora atende este CEP.");
    return { live: true, message: "Cotação atualizada pelo Melhor Envio.", options };
  });
