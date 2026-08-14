import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => !value || /^https?:\/\//i.test(value),
    "Informe uma URL iniciada por http:// ou https://",
  );

export const siteSettingsSchema = z.object({
  id: z.literal("footer"),
  store_description: z.string().trim().min(1).max(500),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 13;
    }, "Informe um WhatsApp válido com DDD"),
  email: z.string().trim().email().max(254),
  address: z.string().trim().min(1).max(300),
  payment_methods: z.string().trim().min(1).max(300),
  instagram_url: optionalHttpUrl,
  youtube_url: optionalHttpUrl,
  company_document: z.string().trim().max(80),
  copyright_text: z.string().trim().min(1).max(160),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const international = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${international}`;
}

export const defaultSiteSettings: SiteSettings = {
  id: "footer",
  store_description:
    "Skate, streetwear e lifestyle urbano. Curadoria de marcas originais, entrega para todo o Brasil e atendimento de quem anda de skate.",
  phone: "(11) 4002-8922",
  email: "contato@dropskateshop.com.br",
  address: "Rua do Skate, 100 — São Paulo/SP",
  payment_methods: "PIX · Crédito · Débito · Boleto · Carteiras digitais",
  instagram_url: "",
  youtube_url: "",
  company_document: "CNPJ 00.000.000/0001-00",
  copyright_text: "Todos os direitos reservados",
};

export async function loadSiteSettings(): Promise<SiteSettings> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return defaultSiteSettings;
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .eq("id", "footer")
    .maybeSingle();
  if (error) {
    console.warn("Configurações do rodapé indisponíveis:", error.message);
    return defaultSiteSettings;
  }
  const parsed = siteSettingsSchema.safeParse(data);
  return parsed.success ? parsed.data : defaultSiteSettings;
}

export async function saveSiteSettings(settings: SiteSettings): Promise<SiteSettings> {
  const parsed = siteSettingsSchema.safeParse(settings);
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? "Revise os campos do rodapé.");

  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase ainda não está configurado.");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.");

  const { data, error } = await supabase
    .from("site_settings")
    .upsert({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: auth.user.id })
    .select("*")
    .single();
  if (error) throw new Error(`Não foi possível salvar: ${error.message}`);

  const saved = siteSettingsSchema.safeParse(data);
  if (!saved.success) throw new Error("O banco retornou dados inválidos.");
  window.dispatchEvent(new CustomEvent("drop-site-settings-updated", { detail: saved.data }));
  return saved.data;
}
