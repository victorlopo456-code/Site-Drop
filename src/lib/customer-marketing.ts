import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/server-security";

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
    await enforceRateLimit(supabase, data.visitorId, "cart-recovery", 120, 60 * 60);
    let userId: string | null = null;
    const email = data.email?.toLowerCase() ?? null;
    if (data.accessToken) {
      const { data: auth } = await supabase.auth.getUser(data.accessToken);
      userId = auth.user?.id ?? null;
    }
    const subtotal = data.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const { error } = await supabase.from("abandoned_carts").upsert(
      {
        visitor_id: data.visitorId,
        user_id: userId,
        email,
        items: data.items,
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
