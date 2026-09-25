import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { sendMarketingEmail } from "@/lib/marketing-email";

type CartItem = { name: string; variantLabel?: string; qty: number };
type ProductRow = {
  id: string;
  slug: string;
  name: string;
  stock: number;
  sold_out: boolean;
  variants: unknown;
};

export const Route = createFileRoute("/api/marketing/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim();
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Não autorizado", { status: 401 });
        }
        const url = process.env.VITE_SUPABASE_URL?.trim();
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!url || !key) return new Response("Backend não configurado", { status: 503 });
        const supabase = createClient(url, key, { auth: { persistSession: false } });
        const siteUrl = (process.env.SITE_URL ?? "https://drop-skate-shop.vercel.app").replace(
          /\/$/,
          "",
        );
        let cartSent = 0;
        let stockSent = 0;
        let failed = 0;
        let deletedCarts = 0;
        let deletedAlerts = 0;

        // Minimiza a retenção de dados pessoais usados apenas para lembretes.
        const cartRetentionDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const alertRetentionDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: removedCarts, error: cartCleanupError } = await supabase
          .from("abandoned_carts")
          .delete()
          .lt("updated_at", cartRetentionDate)
          .select("id");
        if (cartCleanupError) console.error("Falha ao limpar carrinhos antigos", cartCleanupError);
        else deletedCarts = removedCarts?.length ?? 0;
        const { data: removedAlerts, error: alertCleanupError } = await supabase
          .from("stock_notifications")
          .delete()
          .not("sent_at", "is", null)
          .lt("sent_at", alertRetentionDate)
          .select("id");
        if (alertCleanupError) console.error("Falha ao limpar avisos antigos", alertCleanupError);
        else deletedAlerts = removedAlerts?.length ?? 0;

        const { data: carts, error: cartsError } = await supabase
          .from("abandoned_carts")
          .select("id,email,items,subtotal,updated_at")
          .not("email", "is", null)
          .is("reminder_sent_at", null)
          .gte("updated_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
          .lte("updated_at", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
          .limit(100);
        if (cartsError) return new Response("Falha ao consultar carrinhos", { status: 500 });
        for (const cart of carts ?? []) {
          const items = Array.isArray(cart.items) ? (cart.items as CartItem[]) : [];
          if (!items.length || !cart.email) continue;
          const detail = items
            .slice(0, 4)
            .map(
              (item) =>
                `${item.qty}x ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}`,
            )
            .join(" · ");
          try {
            const sent = await sendMarketingEmail({
              to: cart.email,
              subject: "Seu carrinho ainda está esperando por você",
              title: "Você esqueceu algo por aqui",
              message:
                "Seus produtos continuam no carrinho. Volte para concluir a compra enquanto ainda estão disponíveis.",
              detail,
              buttonLabel: "VOLTAR AO CARRINHO",
              buttonUrl: siteUrl,
              idempotencyKey: `cart-${cart.id}-${cart.updated_at}`,
            });
            if (sent) {
              const { error: updateError } = await supabase
                .from("abandoned_carts")
                .update({ reminder_sent_at: new Date().toISOString() })
                .eq("id", cart.id);
              if (updateError) throw updateError;
              cartSent += 1;
            }
          } catch (error) {
            failed += 1;
            console.error("Falha ao enviar lembrete de carrinho", cart.id, error);
          }
        }

        const { data: alerts, error: alertsError } = await supabase
          .from("stock_notifications")
          .select("id,email,product_id,variant_id")
          .is("sent_at", null)
          .limit(200);
        if (alertsError) return new Response("Falha ao consultar avisos", { status: 500 });
        const productIds = [...new Set((alerts ?? []).map((alert) => alert.product_id))];
        const { data: products, error: productsError } = productIds.length
          ? await supabase
              .from("products")
              .select("id,slug,name,stock,sold_out,variants")
              .in("id", productIds)
          : { data: [] as ProductRow[], error: null };
        if (productsError) return new Response("Falha ao consultar produtos", { status: 500 });
        const productMap = new Map(
          (products ?? []).map((product) => [product.id, product as ProductRow]),
        );
        for (const alert of alerts ?? []) {
          const product = productMap.get(alert.product_id);
          if (!product || product.sold_out) continue;
          const variants = Array.isArray(product.variants)
            ? (product.variants as Array<{
                id: string;
                size?: string;
                color?: string;
                stock: number;
              }>)
            : [];
          const variant = alert.variant_id
            ? variants.find((item) => item.id === alert.variant_id)
            : null;
          const available = variant
            ? variant.stock > 0
            : variants.length
              ? variants.some((item) => item.stock > 0)
              : product.stock > 0;
          if (!available) continue;
          const variantName = variant
            ? [variant.size, variant.color].filter(Boolean).join(" · ")
            : "";
          try {
            const sent = await sendMarketingEmail({
              to: alert.email,
              subject: `${product.name} voltou ao estoque`,
              title: "Voltou! Mas pode acabar rápido",
              message: `${product.name}${variantName ? ` — ${variantName}` : ""} está disponível novamente.`,
              buttonLabel: "VER PRODUTO",
              buttonUrl: `${siteUrl}/produto/${encodeURIComponent(product.slug)}`,
              idempotencyKey: `stock-${alert.id}`,
            });
            if (sent) {
              const { error: updateError } = await supabase
                .from("stock_notifications")
                .update({ sent_at: new Date().toISOString() })
                .eq("id", alert.id);
              if (updateError) throw updateError;
              stockSent += 1;
            }
          } catch (error) {
            failed += 1;
            console.error("Falha ao enviar aviso de estoque", alert.id, error);
          }
        }
        return Response.json({
          carts: cartSent,
          stock: stockSent,
          failed,
          deletedCarts,
          deletedAlerts,
        });
      },
    },
  },
});
