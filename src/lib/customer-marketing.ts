import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const cartItemSchema = z.object({
  productId: z.string().min(1).max(100),
  variantId: z.string().max(100).optional(),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  variantLabel: z.string().max(100).optional(),
  image: z.string().url().max(2_000),
  price: z.number().nonnegative().finite(),
  qty: z.number().int().min(1).max(99),
});

function serviceClient() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Serviço temporariamente indisponível.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
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
    let userId: string | null = null;
    let email = data.email?.toLowerCase() ?? null;
    if (data.accessToken) {
      const { data: auth } = await supabase.auth.getUser(data.accessToken);
      userId = auth.user?.id ?? null;
      email = auth.user?.email?.toLowerCase() ?? email;
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
    const { error } = await supabase.from("stock_notifications").insert({
      product_id: data.productId,
      variant_id: data.variantId,
      email: data.email.toLowerCase(),
    });
    if (error && error.code !== "23505") throw new Error("Não foi possível criar o aviso.");
    return { subscribed: true };
  });
