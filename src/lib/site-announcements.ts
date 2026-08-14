import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const announcementSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(80),
  accent: z.boolean(),
  position: z.number().int().min(0).max(20),
  enabled: z.boolean(),
});

export type SiteAnnouncement = z.infer<typeof announcementSchema>;

export const defaultSiteAnnouncements: SiteAnnouncement[] = [
  {
    id: "5ca716d3-7149-4c9f-9842-b1848f515251",
    text: "Frete grátis acima de R$ 399",
    accent: false,
    position: 0,
    enabled: true,
  },
  {
    id: "39a565df-c88e-4b04-8272-36c59b685316",
    text: "10x sem juros",
    accent: true,
    position: 1,
    enabled: true,
  },
  {
    id: "c8f5d445-9d49-4ec7-8ed5-7d318f64dc33",
    text: "Produtos originais",
    accent: false,
    position: 2,
    enabled: true,
  },
  {
    id: "9d041329-86f2-48f2-919a-cb66aed94a18",
    text: "Cupom DROP10 · 10% OFF",
    accent: true,
    position: 3,
    enabled: true,
  },
  {
    id: "c4f4e105-61e8-4781-9fe1-8fe773d3fc0c",
    text: "Troca fácil em 30 dias",
    accent: false,
    position: 4,
    enabled: true,
  },
];

export async function loadSiteAnnouncements(): Promise<SiteAnnouncement[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return defaultSiteAnnouncements;
  const { data, error } = await supabase
    .from("site_announcements")
    .select("id,text,accent,position,enabled")
    .order("position");
  if (error) return defaultSiteAnnouncements;
  const parsed = z.array(announcementSchema).safeParse(data);
  return parsed.success ? parsed.data : defaultSiteAnnouncements;
}

export async function saveSiteAnnouncements(items: SiteAnnouncement[]) {
  const parsed = z.array(announcementSchema).min(1).max(12).safeParse(items);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Revise os avisos.");
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sua sessão expirou.");
  const records = parsed.data.map((item, position) => ({
    ...item,
    position,
    updated_at: new Date().toISOString(),
    updated_by: auth.user!.id,
  }));
  const { data: current, error: currentError } = await supabase
    .from("site_announcements")
    .select("id");
  if (currentError) throw new Error(currentError.message);
  const removed = (current ?? [])
    .map((item) => item.id as string)
    .filter((id) => !records.some((item) => item.id === id));
  if (removed.length) {
    const { error } = await supabase.from("site_announcements").delete().in("id", removed);
    if (error) throw new Error(error.message);
  }
  const { data, error } = await supabase
    .from("site_announcements")
    .upsert(records)
    .select("id,text,accent,position,enabled")
    .order("position");
  if (error) throw new Error(error.message);
  const saved = z.array(announcementSchema).parse(data);
  window.dispatchEvent(new CustomEvent("drop-announcements-updated", { detail: saved }));
  return saved;
}
