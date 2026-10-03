import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enforceRateLimit, enforcePublicRateLimit } from "@/lib/server-security";
import { databaseProductPrice } from "@/lib/product-pricing";

const cartItemSchema = z.object({
  productId: z.string().min(1).max(100),
  variantId: z.string().max(100).optional(),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  variantLabel: z.string().max(100).optional(),
  // Imagens do catálogo podem ser URLs absolutas ou caminhos locais, como /assets/produto.jpg.
  image: z.string().min(1).max(2_000),
  price: z.number().nonnegative().finite(),
  qty: z.number().int().min(1).max(99),
});

function serviceClient() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Serviço temporariamente indisponível.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function privateRateKey(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const syncRecoveryCart = createServerFn({ method: "POST" })
  .validator(
    z.object({
      visitorId: z.string().uuid(),
      accessToken: z.string().max(4_000).nullable(),
      email: z.string().trim().email().max(320).nullable(),
      items: z.array(cartItemSchema).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const supabase = serviceClient();
    await enforcePublicRateLimit(supabase, "cart-recovery", 120, 60 * 60);
    await enforceRateLimit(supabase, data.visitorId, "cart-recovery", 120, 60 * 60);
    let userId: string | null = null;
    let email = data.email?.toLowerCase() ?? null;
    if (data.accessToken) {
      const { data: auth, error: authError } = await supabase.auth.getUser(data.accessToken);
      if (authError || !auth.user) throw new Error("Sessão inválida ou expirada.");
      userId = auth.user?.id ?? null;
      email = auth.user.email?.toLowerCase() ?? null;
    }
    // Recovery messages must use the catalog, not arbitrary text and prices
    // submitted by a caller to an endpoint that sends branded emails.
    let items = data.items;
    if (items.length) {
      const { data: products, error: catalogError } = await supabase
        .from("products")
        .select("id,slug,name,price,base_price,compare_at,promotion,images,variants")
        .eq("enabled", true)
        .in("id", [...new Set(items.map((item) => item.productId))]);
      if (catalogError) throw new Error("Não foi possível validar o carrinho.");
      const byId = new Map((products ?? []).map((product) => [String(product.id), product]));
      items = items.flatMap((item) => {
        const product = byId.get(item.productId);
        if (!product) return [];
        const variants = (Array.isArray(product.variants) ? product.variants : []) as Array<{
          id: string;
          size?: string;
          color?: string;
        }>;
        const variant = variants.find((value) => value.id === item.variantId);
        if (variants.length && !variant) return [];
        const images = Array.isArray(product.images) ? product.images : [];
        return [
          {
            ...item,
            name: product.name,
            slug: product.slug,
            image: typeof images[0] === "string" ? images[0] : "/favicon.ico",
            price: databaseProductPrice(product),
            variantId: variant?.id,
            variantLabel: variant
              ? [variant.size, variant.color].filter(Boolean).join(" · ")
              : undefined,
          },
        ];
      });
    }
    const subtotal =
      Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
    const { error } = await supabase.from("abandoned_carts").upsert(
      {
        visitor_id: data.visitorId,
        user_id: userId,
        email,
        items,
        subtotal,
        reminder_sent_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "visitor_id" },
    );
    if (error) throw new Error("Não foi possível salvar o carrinho.");
    return { saved: true, email };
  });

export const subscribeStockAlert = createServerFn({ method: "POST" })
  .validator(
    z.object({
      productId: z.string().min(1).max(100),
      variantId: z.string().max(100).nullable(),
      email: z.string().trim().email().max(320),
    }),
  )
  .handler(async ({ data }) => {
    const supabase = serviceClient();
    await enforcePublicRateLimit(supabase, "stock-alert", 30, 60 * 60);
    const email = data.email.toLowerCase();
    await enforceRateLimit(
      supabase,
      await privateRateKey(`${data.productId}:${email}`),
      "stock-alert",
      5,
      60 * 60,
    );

    let existingQuery = supabase
      .from("stock_notifications")
      .select("id")
      .eq("product_id", data.productId)
      .eq("email", email);
    existingQuery = data.variantId
      ? existingQuery.eq("variant_id", data.variantId)
      : existingQuery.is("variant_id", null);
    const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
    if (lookupError) throw new Error("Não foi possível criar o aviso.");

    const timestamp = new Date().toISOString();
    const { error } = existing
      ? await supabase
          .from("stock_notifications")
          .update({ sent_at: null, created_at: timestamp })
          .eq("id", existing.id)
      : await supabase.from("stock_notifications").insert({
          product_id: data.productId,
          variant_id: data.variantId,
          email,
        });
    if (error) throw new Error("Não foi possível criar o aviso.");
    return { subscribed: true };
  });
