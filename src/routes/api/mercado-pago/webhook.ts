import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { sendOrderEmail } from "@/lib/transactional-email";
import { paymentMatchesOrder, shouldApplyPayment } from "@/lib/payment-security";
import { validMercadoPagoSignature } from "@/lib/webhook-signature";
import { readLimitedBody, RequestBodyTooLarge } from "@/lib/request-body";

export const Route = createFileRoute("/api/mercado-pago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
        const mercadoPagoToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
        const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
        const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!webhookSecret || !mercadoPagoToken || !supabaseUrl || !serviceRole) {
          return Response.json({ error: "Webhook não configurado" }, { status: 503 });
        }

        let body: { type?: string; data?: { id?: string | number } } = {};
        try {
          const rawBody = new TextDecoder().decode(await readLimitedBody(request, 32_768));
          body = JSON.parse(rawBody) as typeof body;
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            return Response.json({ error: "JSON inválido" }, { status: 400 });
          }
        } catch (error) {
          if (error instanceof RequestBodyTooLarge) {
            return Response.json({ error: "Requisição muito grande" }, { status: 413 });
          }
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        if (body.type !== "payment") return Response.json({ received: true });
        const url = new URL(request.url);
        const dataId = url.searchParams.get("data.id") ?? String(body.data?.id ?? "");
        if (!/^\d{1,40}$/.test(dataId)) {
          return Response.json({ error: "Identificador inválido" }, { status: 400 });
        }
        if (!(await validMercadoPagoSignature(request, dataId, webhookSecret))) {
          return Response.json({ error: "Assinatura inválida" }, { status: 401 });
        }

        const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
          headers: { Authorization: `Bearer ${mercadoPagoToken}` },
        });
        if (!paymentResponse.ok)
          return Response.json({ error: "Pagamento não encontrado" }, { status: 502 });
        const payment = (await paymentResponse.json()) as {
          id: number;
          status: string;
          external_reference?: string;
          transaction_amount?: number;
          currency_id?: string;
          date_approved?: string;
        };
        if (!payment.external_reference) return Response.json({ received: true });

        const supabase = createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: order } = await supabase
          .from("orders")
          .select("id,total,status,payment_status,mercado_pago_payment_id,stock_restored_at")
          .eq("id", payment.external_reference)
          .maybeSingle();
        if (!order) return Response.json({ received: true });
        if (!paymentMatchesOrder(payment, order)) {
          return Response.json({ error: "Valor divergente" }, { status: 409 });
        }
        if (!shouldApplyPayment(payment, order)) return Response.json({ received: true });

        const statusMap: Record<string, string> = {
          rejected: "payment_rejected",
          cancelled: "payment_cancelled",
          refunded: "payment_refunded",
          charged_back: "payment_refunded",
        };
        if (payment.status === "approved") {
          const { data: stockApplied, error } = await supabase.rpc(
            "confirm_paid_order_and_decrement_stock",
            {
              p_order_id: order.id,
              p_payment_id: String(payment.id),
              p_paid_at: payment.date_approved ?? new Date().toISOString(),
            },
          );
          if (error) return Response.json({ error: "Falha ao processar estoque" }, { status: 500 });
          await supabase
            .from("orders")
            .update({ fulfillment_status: stockApplied ? "preparing" : "stock_review" })
            .eq("id", order.id)
            .eq("payment_status", "approved")
            .in("fulfillment_status", ["waiting_payment", "stock_review"]);
        } else {
          const { data: updatedOrders, error: updateError } = await supabase
            .from("orders")
            .update({
              status: statusMap[payment.status] ?? "awaiting_payment",
              payment_status: payment.status,
              mercado_pago_payment_id: String(payment.id),
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id)
            .eq("status", order.status)
            .select("id");
          if (updateError)
            return Response.json({ error: "Falha ao atualizar pagamento" }, { status: 500 });
          if (!updatedOrders?.length) {
            return Response.json({ error: "Pedido atualizado; tente novamente" }, { status: 409 });
          }
          if (payment.status === "refunded" || payment.status === "charged_back") {
            const { error: restoreError } = await supabase.rpc("restore_order_stock", {
              p_order_id: order.id,
            });
            if (restoreError) {
              return Response.json(
                { error: "Pagamento devolvido; falha ao restaurar estoque" },
                { status: 500 },
              );
            }
            await supabase
              .from("orders")
              .update({ fulfillment_status: "refunded", refunded_at: new Date().toISOString() })
              .eq("id", order.id);
          }
        }
        const emailEvent =
          payment.status === "approved"
            ? "payment_approved"
            : payment.status === "refunded" || payment.status === "charged_back"
              ? "refunded"
              : payment.status === "rejected" || payment.status === "cancelled"
                ? "cancelled"
                : null;
        if (emailEvent) {
          const { data: emailOrder } = await supabase
            .from("orders")
            .select(
              "id,order_number,buyer_name,buyer_email,total,fulfillment_status,carrier,tracking_code",
            )
            .eq("id", order.id)
            .maybeSingle();
          if (emailOrder) await sendOrderEmail(supabase, emailOrder, emailEvent);
        }
        return Response.json({ received: true });
      },
    },
  },
});
