import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseConfig } from "@/lib/supabase";
import { requireMfaAdmin } from "@/lib/server-security";

export const sitePromoBannerSchema = z.object({
  id: z.literal("home-promo"),
  eyebrow: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(300),
  coupon: z.string().trim().max(40),
  button_label: z.string().trim().min(1).max(60),
  button_url: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine(
      (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
      "Informe uma rota iniciada por / ou uma URL completa.",
    ),
  enabled: z.boolean(),
});

export type SitePromoBanner = z.infer<typeof sitePromoBannerSchema>;

export const defaultSitePromoBanner: SitePromoBanner = {
  id: "home-promo",
  eyebrow: "Semana DROP",
  title: "Até 30% OFF em setups completos",
  description: "Monte seu skate com shape, truck, rodas e rolamentos com desconto progressivo.",
  coupon: "BLACK20",
  button_label: "Ver promoções",
  button_url: "/promocoes",
  enabled: true,
};

function serverClient(accessToken?: string) {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

export const getSitePromoBanner = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverClient();
  if (!supabase) return defaultSitePromoBanner;
  const { data, error } = await supabase
    .from("site_promo_banners")
    .select("id,eyebrow,title,description,coupon,button_label,button_url,enabled")
    .eq("id", "home-promo")
    .maybeSingle();
  if (error) return defaultSitePromoBanner;
  const parsed = sitePromoBannerSchema.safeParse(data);
  return parsed.success ? parsed.data : defaultSitePromoBanner;
});

const saveSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  banner: sitePromoBannerSchema,
});

export const saveSitePromoBanner = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const supabase = serverClient(data.accessToken);
    if (!supabase) throw new Error("Supabase ainda não está configurado.");
    const adminId = await requireMfaAdmin(supabase, data.accessToken);
    const { data: saved, error } = await supabase
      .from("site_promo_banners")
      .upsert({ ...data.banner, updated_at: new Date().toISOString(), updated_by: adminId })
      .select("id,eyebrow,title,description,coupon,button_label,button_url,enabled")
      .single();
    if (error) throw new Error(`Não foi possível salvar: ${error.message}`);
    return sitePromoBannerSchema.parse(saved);
  });
