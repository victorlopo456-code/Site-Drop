import type { SupabaseClient } from "@supabase/supabase-js";

type EmailOrder = {
  id: string;
  order_number: number;
  buyer_name: string;
  buyer_email: string;
  total: number | string;
  fulfillment_status: string;
  shipping_method?: string | null;
  carrier: string | null;
  tracking_code: string | null;
};

const statusContent: Record<string, { subject: string; title: string; message: string }> = {
  payment_reminder: {
    subject: "Seu pedido ainda está aguardando pagamento",
    title: "Falta pouco para concluir seu pedido",
    message:
      "Seu pagamento ainda está pendente. Acesse sua conta para conferir o pedido antes que ele seja cancelado automaticamente.",
  },
  payment_approved: {
    subject: "Pagamento confirmado",
    title: "Pagamento aprovado!",
    message: "Recebemos seu pedido e já vamos começar a preparação.",
  },
  preparing: {
    subject: "Pedido em preparação",
    title: "Seu pedido está sendo preparado",
    message: "Nossa equipe já está separando e embalando seus produtos.",
  },
  shipped: {
    subject: "Pedido enviado",
    title: "Seu pedido saiu para entrega",
    message: "A transportadora já recebeu seu pedido.",
  },
  delivered: {
    subject: "Pedido entregue",
    title: "Pedido entregue!",
    message: "Esperamos que você curta sua compra. Obrigado por escolher a DROP.",
  },
  cancelled: {
    subject: "Pedido cancelado",
    title: "Seu pedido foi cancelado",
    message: "O pedido foi cancelado. Entre em contato conosco caso precise de ajuda.",
  },
  refunded: {
    subject: "Pagamento reembolsado",
    title: "Seu reembolso foi realizado",
    message: "O Mercado Pago processará o valor conforme o prazo da forma de pagamento utilizada.",
  },
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );
}

export async function sendOrderEmail(
  supabase: SupabaseClient,
  order: EmailOrder,
  event: keyof typeof statusContent,
) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ORDER_EMAIL_FROM?.trim();
  const siteUrl = (process.env.SITE_URL ?? "https://drop-skate-shop.vercel.app").replace(/\/$/, "");
  const storePickup =
    order.shipping_method?.trim().toLocaleLowerCase("pt-BR") === "retirar na loja";
  const pickupContent = storePickup
    ? {
        shipped: {
          subject: "Pedido pronto para retirada",
          title: "Seu pedido está pronto para retirada!",
          message: "Seu pedido já pode ser retirado em nossa loja física.",
        },
        delivered: {
          subject: "Pedido retirado",
          title: "Pedido retirado!",
          message: "A retirada foi concluída. Obrigado por escolher a DROP.",
        },
      }
    : null;
  const content = pickupContent?.[event as "shipped" | "delivered"] ?? statusContent[event];
  if (!apiKey || !from || !content) return { sent: false, reason: "not_configured" };

  const eventKey = `${event}-${order.tracking_code ?? "none"}`.slice(0, 180);
  const { error: reserveError } = await supabase.from("order_email_deliveries").insert({
    order_id: order.id,
    event_key: eventKey,
    recipient: order.buyer_email,
    status: "sending",
  });
  if (reserveError?.code === "23505") return { sent: false, reason: "duplicate" };
  if (reserveError) return { sent: false, reason: reserveError.message };

  const tracking = order.tracking_code
    ? `<div style="margin:20px 0;padding:16px;background:#fff7ed;border:1px solid #f57c00;border-radius:8px"><strong>Rastreio:</strong> ${escapeHtml(order.tracking_code)}${order.carrier ? ` · ${escapeHtml(order.carrier)}` : ""}</div>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#111;color:#f5f5f5;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:32px 20px"><p style="color:#f57c00;font-weight:bold;letter-spacing:2px">DROP SKATE SHOP</p><h1>${content.title}</h1><p>Olá, ${escapeHtml(order.buyer_name)}.</p><p>${content.message}</p>${tracking}<p><strong>Pedido:</strong> #DRP${order.order_number}</p><p><strong>Total:</strong> ${Number(order.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><a href="${siteUrl}/conta" style="display:inline-block;margin-top:18px;padding:13px 20px;background:#f57c00;color:#111;text-decoration:none;font-weight:bold;border-radius:6px">ACOMPANHAR PEDIDO</a><p style="margin-top:32px;color:#999;font-size:12px">Mensagem automática da DROP Skate Shop.</p></div></body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `order-${order.id}-${eventKey}`,
      },
      body: JSON.stringify({
        from,
        to: [order.buyer_email],
        subject: `${content.subject} · Pedido #DRP${order.order_number}`,
        html,
      }),
    });
    const result = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !result.id) throw new Error(result.message ?? "Falha no envio.");
    await supabase
      .from("order_email_deliveries")
      .update({ status: "sent", provider_id: result.id, sent_at: new Date().toISOString() })
      .eq("order_id", order.id)
      .eq("event_key", eventKey);
    return { sent: true };
  } catch (error) {
    await supabase
      .from("order_email_deliveries")
      .delete()
      .eq("order_id", order.id)
      .eq("event_key", eventKey);
    console.error("Falha ao enviar e-mail do pedido:", error);
    return { sent: false, reason: "provider_error" };
  }
}
