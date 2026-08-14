import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseConfig } from "@/lib/supabase";
import { requireMfaAdmin } from "@/lib/server-security";

export const benefitIcons = ["truck", "card", "shield", "coupon"] as const;

export const siteBenefitSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(120),
  icon: z.enum(benefitIcons),
  position: z.number().int().min(0).max(20),
  enabled: z.boolean(),
});

export type SiteBenefit = z.infer<typeof siteBenefitSchema>;

export const defaultSiteBenefits: SiteBenefit[] = [
  {
    id: "free-shipping",
    title: "Frete grátis",
    description: "Em compras acima de R$ 399",
    icon: "truck",
    position: 0,
    enabled: true,
  },
  {
    id: "installments",
    title: "10x sem juros",
    description: "PIX, cartão e boleto",
    icon: "card",
    position: 1,
    enabled: true,
  },
  {
    id: "secure-navigation",
    title: "Navegação protegida",
    description: "Cabeçalhos HTTP de segurança",
    icon: "shield",
    position: 2,
    enabled: true,
  },
  {
    id: "first-order-coupon",
    title: "Cupom DROP10",
    description: "10% OFF na primeira compra",
    icon: "coupon",
    position: 3,
    enabled: true,
  },
];

function createServerSupabase(accessToken?: string) {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

export const getSiteBenefits = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createServerSupabase();
  if (!supabase) return defaultSiteBenefits;

  const { data, error } = await supabase
    .from("site_benefits")
    .select("id,title,description,icon,position,enabled")
    .eq("enabled", true)
    .order("position");

  if (error) {
    console.error("Falha ao carregar benefícios do Supabase:", error.message);
    return defaultSiteBenefits;
  }

  const parsed = z.array(siteBenefitSchema).safeParse(data);
  return parsed.success ? parsed.data : defaultSiteBenefits;
});

const saveSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  benefits: z.array(siteBenefitSchema).min(1).max(8),
});

export const saveSiteBenefits = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const supabase = createServerSupabase(data.accessToken);
    if (!supabase) throw new Error("Supabase ainda não está configurado.");

    const adminId = await requireMfaAdmin(supabase, data.accessToken);

    const records = data.benefits.map((benefit) => ({
      ...benefit,
      updated_at: new Date().toISOString(),
      updated_by: adminId,
    }));
    const { data: saved, error } = await supabase
      .from("site_benefits")
      .upsert(records, { onConflict: "id" })
      .select("id,title,description,icon,position,enabled")
      .order("position");
    if (error) throw new Error(`Não foi possível salvar: ${error.message}`);

    const parsed = z.array(siteBenefitSchema).safeParse(saved);
    if (!parsed.success) throw new Error("O banco retornou dados inválidos.");
    return parsed.data;
  });
