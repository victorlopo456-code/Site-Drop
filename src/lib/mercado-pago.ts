import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyShippingQuote } from "@/lib/shipping";
import { validateCouponInDatabase } from "@/lib/coupons";
import { enforceRateLimit } from "@/lib/server-security";
import { sendOrderEmail } from "@/lib/transactional-email";

const checkoutSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        variantId: z.string().min(1).max(100).optional(),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(100),
  coupon: z.string().trim().max(30).nullable(),
  shippingQuote: z.string().min(40).max(5000),
  buyer: z.object({
    nome: z.string().trim().min(3).max(100),
    email: z.string().trim().email().max(255),
    cpf: z.string().regex(/^\d{11}$/),
    cep: z.string().regex(/^\d{8}$/),
    endereco: z.string().trim().min(3).max(200),
    numero: z.string().trim().min(1).max(10),
    cidade: z.string().trim().min(2).max(100),
  }),
  analytics: z
    .object({
      sessionId: z.string().uuid(),
      source: z.string().trim().min(1).max(80),
      medium: z.string().trim().min(1).max(80),
      campaign: z.string().trim().max(100),
    })
    .optional(),
});

const money = (value: number) => Math.round(value * 100) / 100;

export const createMercadoPagoCheckout = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const mercadoPagoToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    const siteUrl = process.env.SITE_URL?.trim()?.replace(/\/$/, "");
    if (!supabaseUrl || !serviceRole) throw new Error("Backend do Supabase não configurado.");
    if (!mercadoPagoToken) throw new Error("Access Token do Mercado Pago não configurado.");
    if (!siteUrl || !/^https?:\/\//i.test(siteUrl)) throw new Error("SITE_URL não configurada.");

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await supabase.auth.getUser(data.accessToken);
    if (authError || !auth.user) throw new Error("Entre na sua conta antes de finalizar a compra.");
    await enforceRateLimit(supabase, auth.user.id, "checkout", 8, 15 * 60);

    const groupedItems = new Map<string, (typeof data.items)[number]>();
    for (const item of data.items) {
      const key = `${item.id}:${item.variantId ?? ""}`;
      const existing = groupedItems.get(key);
      const qty = (existing?.qty ?? 0) + item.qty;
      if (qty > 99) throw new Error("Quantidade máxima por item excedida.");
      groupedItems.set(key, { ...item, qty });
    }
    const normalizedItems = [...groupedItems.values()];
    const uniqueIds = [...new Set(normalizedItems.map((item) => item.id))];
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id,sku,name,price,stock,variants,images,enabled,sold_out")
      .in("id", uniqueIds);
    if (productsError) throw new Error("Não foi possível validar os produtos.");
    if (!products || products.length !== uniqueIds.length)
      throw new Error("Um produto não está mais disponível.");

    const byId = new Map(products.map((product) => [product.id as string, product]));
    const requested = normalizedItems.map((item) => {
      const product = byId.get(item.id);
      if (!product || !product.enabled || product.sold_out)
        throw new Error("Um produto está esgotado.");
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const variant = variants.length
        ? (variants.find((candidate) => (candidate as { id?: string }).id === item.variantId) as
            { id: string; size?: string; color?: string; stock?: number } | undefined)
        : undefined;
      if (variants.length && !variant)
        throw new Error(`Escolha uma variação válida para ${product.name}.`);
      if (!variants.length && item.variantId) throw new Error("Variação inválida no carrinho.");
      const stock = variant
        ? Math.max(0, Number(variant.stock) || 0)
        : Math.max(0, Number(product.stock) || 0);
      if (stock < item.qty) throw new Error(`Estoque insuficiente para ${product.name}.`);
      return { product, variant, qty: item.qty, price: money(Number(product.price)) };
    });

    const subtotal = money(requested.reduce((sum, item) => sum + item.price * item.qty, 0));
    const normalizedCoupon = data.coupon?.trim().toUpperCase() ?? "";
    const couponResult = normalizedCoupon
      ? await validateCouponInDatabase(supabase, normalizedCoupon, subtotal, auth.user.id)
      : null;
    const requestedDiscount = couponResult?.discount ?? 0;
    const shipping = await verifyShippingQuote(
      data.shippingQuote,
      serviceRole,
      data.buyer.cep,
      normalizedItems,
    );
    const shippingCost = money(shipping.price);
    const orderId = crypto.randomUUID();

    const discountFactor = subtotal > 0 ? (subtotal - requestedDiscount) / subtotal : 1;
    const orderItems = requested.map(({ product, variant, qty, price }) => {
      const unitPrice = money(price * discountFactor);
      const images = Array.isArray(product.images) ? product.images : [];
      return {
        order_id: orderId,
        product_id: product.id,
        variant_id: variant?.id ?? null,
        variant_size: variant?.size ?? null,
        variant_color: variant?.color ?? null,
        sku: product.sku,
        name: product.name,
        image_url: typeof images[0] === "string" ? images[0] : "",
        quantity: qty,
        unit_price: unitPrice,
        line_total: money(unitPrice * qty),
      };
    });
    const discountedProductsTotal = money(
      orderItems.reduce((sum, item) => sum + item.line_total, 0),
    );
    // Usa o mesmo arredondamento dos itens enviados ao Mercado Pago para não haver divergência de centavos.
    const discount = money(subtotal - discountedProductsTotal);
    const total = money(discountedProductsTotal + shippingCost);

    const { error: orderError } = await supabase.from("orders").insert({
      id: orderId,
      user_id: auth.user.id,
      subtotal,
      discount,
      shipping_cost: shippingCost,
      total,
      coupon_code: couponResult ? normalizedCoupon : null,
      shipping_method: shipping.label,
      shipping_service_id: shipping.serviceId,
      shipping_delivery_days: shipping.days,
      buyer_name: data.buyer.nome,
      buyer_email: data.buyer.email,
      buyer_cpf: data.buyer.cpf,
      shipping_address: {
        cep: data.buyer.cep,
        endereco: data.buyer.endereco,
        numero: data.buyer.numero,
        cidade: data.buyer.cidade,
      },
    });
    if (orderError) throw new Error(`Não foi possível criar o pedido: ${orderError.message}`);

    if (data.analytics) {
      await supabase
        .from("orders")
        .update({
          analytics_session_id: data.analytics.sessionId,
          marketing_source: data.analytics.source,
          marketing_medium: data.analytics.medium,
          marketing_campaign: data.analytics.campaign,
        })
        .eq("id", orderId);
    }

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) {
      await supabase.from("orders").delete().eq("id", orderId);
      throw new Error("Não foi possível registrar os itens do pedido.");
    }

    const preferenceItems = orderItems.map((item) => ({
      id: item.product_id,
      title: item.name,
      quantity: item.quantity,
      currency_id: "BRL",
      unit_price: item.unit_price,
    }));
    if (shippingCost > 0) {
      preferenceItems.push({
        id: "shipping",
        title: shipping.label,
        quantity: 1,
        currency_id: "BRL",
        unit_price: shippingCost,
      });
    }

    const publicReturnUrl =
      siteUrl.startsWith("https://") &&
      !/^https:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(siteUrl);
    const returnConfiguration = publicReturnUrl
      ? {
          back_urls: {
            success: `${siteUrl}/pagamento?resultado=sucesso&pedido=${orderId}`,
            pending: `${siteUrl}/pagamento?resultado=pendente&pedido=${orderId}`,
            failure: `${siteUrl}/pagamento?resultado=falha&pedido=${orderId}`,
          },
          auto_return: "approved",
        }
      : {};

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mercadoPagoToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": orderId,
      },
      body: JSON.stringify({
        items: preferenceItems,
        payer: {
          name: data.buyer.nome,
          email: data.buyer.email,
          identification: { type: "CPF", number: data.buyer.cpf },
        },
        external_reference: orderId,
        ...returnConfiguration,
        statement_descriptor: "DROP SKATE SHOP",
      }),
    });
    const preference = (await response.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      message?: string;
    };
    if (!response.ok || !preference.id) {
      await supabase
        .from("orders")
        .update({ status: "payment_error", payment_status: "error" })
        .eq("id", orderId);
      throw new Error(preference.message ?? "O Mercado Pago recusou a criação do checkout.");
    }
    await supabase
      .from("orders")
      .update({ mercado_pago_preference_id: preference.id })
      .eq("id", orderId);

    const checkoutUrl = mercadoPagoToken.startsWith("TEST-")
      ? (preference.sandbox_init_point ?? preference.init_point)
      : preference.init_point;
    if (!checkoutUrl) throw new Error("O Mercado Pago não retornou o endereço de pagamento.");
    return { orderId, checkoutUrl };
  });

const syncSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  orderId: z.string().uuid(),
  paymentId: z.string().regex(/^\d+$/).max(40),
});

export const syncMercadoPagoPayment = createServerFn({ method: "POST" })
  .validator(syncSchema)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const mercadoPagoToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!supabaseUrl || !serviceRole || !mercadoPagoToken)
      throw new Error("Pagamento não configurado.");
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await supabase.auth.getUser(data.accessToken);
    if (authError || !auth.user) throw new Error("Sessão inválida.");
    await enforceRateLimit(supabase, auth.user.id, "payment-sync", 30, 10 * 60);
    const { data: order } = await supabase
      .from("orders")
      .select("id,user_id,total")
      .eq("id", data.orderId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado.");

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${data.paymentId}`, {
      headers: { Authorization: `Bearer ${mercadoPagoToken}` },
    });
    if (!response.ok) throw new Error("Pagamento ainda não localizado no Mercado Pago.");
    const payment = (await response.json()) as {
      id: number;
      status: string;
      external_reference?: string;
      transaction_amount?: number;
      currency_id?: string;
      date_approved?: string;
    };
    if (
      payment.external_reference !== order.id ||
      payment.currency_id !== "BRL" ||
      Math.abs(Number(payment.transaction_amount) - Number(order.total)) > 0.01
    ) {
      throw new Error("Os dados do pagamento não correspondem ao pedido.");
    }
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
      if (error) throw new Error(`Falha ao confirmar estoque: ${error.message}`);
      await supabase
        .from("orders")
        .update({ fulfillment_status: stockApplied ? "preparing" : "stock_review" })
        .eq("id", order.id);
      const { data: emailOrder } = await supabase
        .from("orders")
        .select(
          "id,order_number,buyer_name,buyer_email,total,fulfillment_status,carrier,tracking_code",
        )
        .eq("id", order.id)
        .maybeSingle();
      if (emailOrder) await sendOrderEmail(supabase, emailOrder, "payment_approved");
      return {
        status: stockApplied ? "payment_approved" : "payment_approved_stock_error",
        paymentStatus: payment.status,
      };
    }

    const status = statusMap[payment.status] ?? "awaiting_payment";
    await supabase
      .from("orders")
      .update({
        status,
        payment_status: payment.status,
        mercado_pago_payment_id: String(payment.id),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    if (["rejected", "cancelled"].includes(payment.status)) {
      const { data: emailOrder } = await supabase
        .from("orders")
        .select(
          "id,order_number,buyer_name,buyer_email,total,fulfillment_status,carrier,tracking_code",
        )
        .eq("id", order.id)
        .maybeSingle();
      if (emailOrder) await sendOrderEmail(supabase, emailOrder, "cancelled");
    }
    return { status, paymentStatus: payment.status };
  });
