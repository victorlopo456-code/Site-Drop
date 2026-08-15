import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { enforceRateLimit, requireMfaAdmin } from "@/lib/server-security";
import { sendOrderEmail } from "@/lib/transactional-email";

export const fulfillmentStatuses = [
  "waiting_payment",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "stock_review",
] as const;

export const manuallyManagedFulfillmentStatuses = [
  "waiting_payment",
  "preparing",
  "shipped",
  "delivered",
] as const satisfies readonly FulfillmentStatus[];

export type FulfillmentStatus = (typeof fulfillmentStatuses)[number];

export const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  waiting_payment: "Aguardando pagamento",
  preparing: "Em preparação",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  stock_review: "Revisar estoque",
};

export type AdminOrderItem = {
  id: number;
  product_id: string | null;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
  variant_size: string | null;
  variant_color: string | null;
};

export type AdminOrder = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  fulfillment_status: FulfillmentStatus;
  total: number | string;
  shipping_cost: number | string;
  shipping_method: string;
  buyer_name: string;
  buyer_email: string;
  buyer_cpf: string;
  shipping_address: { cep?: string; endereco?: string; numero?: string; cidade?: string };
  mercado_pago_payment_id: string | null;
  carrier: string | null;
  tracking_code: string | null;
  admin_notes: string | null;
  stock_error: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  refunded_at: string | null;
  order_items: AdminOrderItem[];
};

export async function loadAdminOrders(): Promise<AdminOrder[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase
    .from("orders")
    .select("*,order_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminOrder[];
}

export async function loadCustomerOrders(): Promise<AdminOrder[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase
    .from("orders")
    .select("*,order_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminOrder[];
}

export async function updateAdminOrder(
  order: AdminOrder,
  patch: {
    fulfillment_status: FulfillmentStatus;
    carrier: string;
    tracking_code: string;
    admin_notes: string;
  },
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  if (
    !manuallyManagedFulfillmentStatuses.includes(
      patch.fulfillment_status as (typeof manuallyManagedFulfillmentStatuses)[number],
    )
  ) {
    throw new Error("Esse status é controlado automaticamente pelo pagamento e pelo estoque.");
  }
  if (
    (patch.fulfillment_status === "shipped" || patch.fulfillment_status === "delivered") &&
    !patch.tracking_code.trim()
  ) {
    throw new Error("Informe o código de rastreio antes de marcar o pedido como enviado.");
  }
  const now = new Date().toISOString();
  const update = {
    ...patch,
    carrier: patch.carrier.trim() || null,
    tracking_code: patch.tracking_code.trim() || null,
    admin_notes: patch.admin_notes.trim() || null,
    shipped_at:
      patch.fulfillment_status === "shipped" || patch.fulfillment_status === "delivered"
        ? (order.shipped_at ?? now)
        : order.shipped_at,
    delivered_at:
      patch.fulfillment_status === "delivered" ? (order.delivered_at ?? now) : order.delivered_at,
    updated_at: now,
  };
  const { error } = await supabase.from("orders").update(update).eq("id", order.id);
  if (error) throw new Error(error.message);
  const { data: auth } = await supabase.auth.getUser();
  const { error: eventError } = await supabase.from("order_events").insert({
    order_id: order.id,
    event_type: "fulfillment_updated",
    description: `Pedido atualizado para: ${fulfillmentLabels[patch.fulfillment_status]}`,
    created_by: auth.user?.id ?? null,
  });
  if (eventError) throw new Error(`Pedido salvo, mas o histórico falhou: ${eventError.message}`);
}

const notificationSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  orderId: z.string().uuid(),
  status: z.enum(["preparing", "shipped", "delivered", "cancelled"]),
});

export const notifyOrderUpdate = createServerFn({ method: "POST" })
  .validator(notificationSchema)
  .handler(async ({ data }) => {
    const url = process.env.VITE_SUPABASE_URL?.trim();
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRole) return { sent: false };
    const supabase = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await requireMfaAdmin(supabase, data.accessToken);
    const { data: order } = await supabase
      .from("orders")
      .select(
        "id,order_number,buyer_name,buyer_email,total,fulfillment_status,carrier,tracking_code",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || order.fulfillment_status !== data.status) return { sent: false };
    return sendOrderEmail(supabase, order, data.status);
  });

const refundSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  orderId: z.string().uuid(),
  confirmation: z.literal("REEMBOLSAR"),
});

export const refundMercadoPagoOrder = createServerFn({ method: "POST" })
  .validator(refundSchema)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const mercadoPagoToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!supabaseUrl || !serviceRole || !mercadoPagoToken)
      throw new Error("Backend não configurado.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminId = await requireMfaAdmin(supabase, data.accessToken);
    await enforceRateLimit(supabase, adminId, "refund", 5, 60 * 60);

    const { data: order } = await supabase
      .from("orders")
      .select("id,status,mercado_pago_payment_id,refund_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado.");
    if (order.refund_id || order.status === "payment_refunded") return { refunded: true };
    if (order.status !== "payment_approved" || !order.mercado_pago_payment_id) {
      throw new Error("Somente pagamentos aprovados podem ser reembolsados.");
    }

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${order.mercado_pago_payment_id}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mercadoPagoToken}`,
          "X-Idempotency-Key": `refund-${order.id}`,
        },
      },
    );
    const refund = (await response.json()) as { id?: number; status?: string; message?: string };
    if (!response.ok || !refund.id) throw new Error(refund.message ?? "O reembolso foi recusado.");

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "payment_refunded",
        payment_status: "refunded",
        fulfillment_status: "refunded",
        refund_id: String(refund.id),
        refunded_at: now,
        updated_at: now,
      })
      .eq("id", order.id);
    if (updateError) {
      throw new Error("Reembolso concluído, mas o pedido precisa de revisão administrativa.");
    }
    const { error: stockError } = await supabase.rpc("restore_order_stock", {
      p_order_id: order.id,
    });
    if (stockError)
      throw new Error("Reembolso concluído, mas o estoque precisa de revisão manual.");
    await supabase.from("order_events").insert({
      order_id: order.id,
      event_type: "refunded",
      description: "Pagamento reembolsado integralmente pelo Mercado Pago.",
      created_by: adminId,
    });
    const { data: refundedOrder } = await supabase
      .from("orders")
      .select(
        "id,order_number,buyer_name,buyer_email,total,fulfillment_status,carrier,tracking_code",
      )
      .eq("id", order.id)
      .maybeSingle();
    if (refundedOrder) await sendOrderEmail(supabase, refundedOrder, "refunded");
    return { refunded: true };
  });
