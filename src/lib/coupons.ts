import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireMfaAdmin } from "@/lib/server-security";

export const couponSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,30}$/),
  description: z.string().trim().max(160),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.number().positive().max(100000),
  minimum_order: z.number().min(0).max(1000000),
  maximum_discount: z.number().positive().max(1000000).nullable(),
  starts_at: z.string().datetime().nullable(),
  ends_at: z.string().datetime().nullable(),
  usage_limit: z.number().int().positive().max(1000000).nullable(),
  per_customer_limit: z.number().int().positive().max(10000).nullable(),
  first_order_only: z.boolean(),
  enabled: z.boolean(),
});

export type Coupon = z.infer<typeof couponSchema> & { used_count?: number };
export type CouponApplication = Pick<
  Coupon,
  "code" | "discount_type" | "discount_value" | "minimum_order" | "maximum_discount"
>;

const money = (value: number) => Math.round(value * 100) / 100;

export function couponDiscount(coupon: CouponApplication, subtotal: number) {
  if (subtotal < coupon.minimum_order) return 0;
  const raw =
    coupon.discount_type === "percentage"
      ? subtotal * (coupon.discount_value / 100)
      : coupon.discount_value;
  return money(Math.min(raw, coupon.maximum_discount ?? raw, subtotal));
}

function serverClient() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Backend do Supabase não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getUserId(supabase: SupabaseClient, accessToken?: string | null) {
  if (!accessToken) return null;
  const { data, error } = await supabase.auth.getUser(accessToken);
  return error ? null : (data.user?.id ?? null);
}

async function requireAdmin(supabase: SupabaseClient, accessToken: string) {
  return requireMfaAdmin(supabase, accessToken);
}

export async function validateCouponInDatabase(
  supabase: SupabaseClient,
  code: string,
  subtotal: number,
  userId?: string | null,
) {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw new Error("Não foi possível validar o cupom.");
  const parsed = couponSchema.safeParse(data);
  if (!parsed.success) throw new Error("Cupom inválido ou inexistente.");
  const coupon = parsed.data;
  const now = Date.now();
  if (!coupon.enabled) throw new Error("Este cupom está desativado.");
  if (coupon.starts_at && Date.parse(coupon.starts_at) > now)
    throw new Error("Este cupom ainda não começou.");
  if (coupon.ends_at && Date.parse(coupon.ends_at) < now) throw new Error("Este cupom expirou.");
  if (subtotal < coupon.minimum_order)
    throw new Error(
      `Compra mínima de R$ ${coupon.minimum_order.toFixed(2).replace(".", ",")} para este cupom.`,
    );

  const paidStatuses = ["payment_approved", "payment_approved_stock_error"];
  if (coupon.usage_limit) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("coupon_code", coupon.code)
      .in("status", paidStatuses);
    if ((count ?? 0) >= coupon.usage_limit)
      throw new Error("O limite de uso deste cupom foi atingido.");
  }
  if (coupon.first_order_only || coupon.per_customer_limit) {
    if (!userId) throw new Error("Entre na sua conta para usar este cupom.");
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", paidStatuses);
    if (coupon.first_order_only && (count ?? 0) > 0)
      throw new Error("Este cupom é válido somente na primeira compra.");
    if (coupon.per_customer_limit) {
      const { count: couponUses } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("coupon_code", coupon.code)
        .in("status", paidStatuses);
      if ((couponUses ?? 0) >= coupon.per_customer_limit)
        throw new Error("Você já atingiu o limite de uso deste cupom.");
    }
  }
  return { coupon, discount: couponDiscount(coupon, subtotal) };
}

const validationSchema = z.object({
  code: z.string().trim().min(1).max(30),
  subtotal: z.number().min(0).max(1000000),
  accessToken: z.string().max(10000).nullable().optional(),
});

export const validateCoupon = createServerFn({ method: "POST" })
  .validator(validationSchema)
  .handler(async ({ data }) => {
    const supabase = serverClient();
    const userId = await getUserId(supabase, data.accessToken);
    const result = await validateCouponInDatabase(supabase, data.code, data.subtotal, userId);
    const { code, discount_type, discount_value, minimum_order, maximum_discount } = result.coupon;
    return {
      coupon: { code, discount_type, discount_value, minimum_order, maximum_discount },
      discount: result.discount,
    };
  });

const adminTokenSchema = z.object({ accessToken: z.string().min(20).max(10000) });

export const loadCoupons = createServerFn({ method: "POST" })
  .validator(adminTokenSchema)
  .handler(async ({ data }) => {
    const supabase = serverClient();
    await requireAdmin(supabase, data.accessToken);
    const { data: rows, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Não foi possível carregar os cupons: ${error.message}`);
    const parsed = z.array(couponSchema).safeParse(rows);
    if (!parsed.success) throw new Error("O banco retornou cupons inválidos.");
    return Promise.all(
      parsed.data.map(async (coupon) => {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("coupon_code", coupon.code)
          .in("status", ["payment_approved", "payment_approved_stock_error"]);
        return { ...coupon, used_count: count ?? 0 };
      }),
    );
  });

const saveCouponSchema = z.object({
  accessToken: z.string().min(20).max(10000),
  coupon: couponSchema,
});

export const saveCoupon = createServerFn({ method: "POST" })
  .validator(saveCouponSchema)
  .handler(async ({ data }) => {
    const supabase = serverClient();
    const userId = await requireAdmin(supabase, data.accessToken);
    const coupon = data.coupon;
    if (coupon.discount_type === "percentage" && coupon.discount_value > 100)
      throw new Error("O desconto percentual não pode passar de 100%.");
    if (
      coupon.starts_at &&
      coupon.ends_at &&
      Date.parse(coupon.ends_at) <= Date.parse(coupon.starts_at)
    )
      throw new Error("O término deve ser posterior ao início.");
    const { used_count: _ignored, ...record } = coupon as Coupon;
    const { error } = await supabase.from("coupons").upsert({
      ...record,
      code: record.code.toUpperCase(),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
    if (error)
      throw new Error(
        error.code === "23505" ? "Já existe um cupom com esse código." : error.message,
      );
    return true;
  });

const deleteSchema = z.object({
  accessToken: z.string().min(20).max(10000),
  id: z.string().uuid(),
});
export const deleteCoupon = createServerFn({ method: "POST" })
  .validator(deleteSchema)
  .handler(async ({ data }) => {
    const supabase = serverClient();
    await requireAdmin(supabase, data.accessToken);
    const { error } = await supabase.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(`Não foi possível excluir: ${error.message}`);
    return true;
  });
