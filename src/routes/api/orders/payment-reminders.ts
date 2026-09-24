import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { sendOrderEmail } from "@/lib/transactional-email";

export const Route = createFileRoute("/api/orders/payment-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET?.trim();
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Não autorizado", { status: 401 });
        }
        const url = process.env.VITE_SUPABASE_URL?.trim();
        const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!url || !serviceRole) return new Response("Backend não configurado", { status: 503 });
        const supabase = createClient(url, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const now = Date.now();
        const { data: orders, error } = await supabase
          .from("orders")
          .select(
            "id,order_number,buyer_name,buyer_email,total,fulfillment_status,shipping_method,carrier,tracking_code",
          )
          .eq("status", "awaiting_payment")
          .gte("created_at", new Date(now - 42 * 60 * 60 * 1000).toISOString())
          .lte("created_at", new Date(now - 6 * 60 * 60 * 1000).toISOString())
          .limit(100);
        if (error) return Response.json({ error: "Falha ao consultar pedidos." }, { status: 500 });
        let sent = 0;
        for (const order of orders ?? []) {
          const result = await sendOrderEmail(supabase, order, "payment_reminder");
          if (result.sent) sent += 1;
        }
        return Response.json({ checked: orders?.length ?? 0, sent });
      },
    },
  },
});
