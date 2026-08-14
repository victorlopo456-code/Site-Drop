import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enforceRateLimit, requireMfaAdmin } from "@/lib/server-security";

const attributionSchema = z.object({
  sessionId: z.string().uuid(),
  source: z.string().trim().min(1).max(80),
  medium: z.string().trim().min(1).max(80),
  campaign: z.string().trim().max(100),
});
export type AnalyticsAttribution = z.infer<typeof attributionSchema>;

const eventSchema = attributionSchema.extend({
  eventName: z.enum(["page_view", "product_view", "add_to_cart", "begin_checkout"]),
  path: z.string().trim().min(1).max(300),
  productId: z.string().max(100).nullable().optional(),
});

function serverClient() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Analytics não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const recordAnalyticsEvent = createServerFn({ method: "POST" })
  .validator(eventSchema)
  .handler(async ({ data }) => {
    const supabase = serverClient();
    await enforceRateLimit(supabase, data.sessionId, "analytics", 120, 60 * 60);
    const { error } = await supabase.rpc("record_analytics_event", {
      p_session_id: data.sessionId,
      p_event_name: data.eventName,
      p_path: data.path,
      p_product_id: data.productId ?? null,
      p_source: data.source,
      p_medium: data.medium,
      p_campaign: data.campaign,
    });
    if (error && !["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code))
      throw new Error("Falha na métrica.");
    return true;
  });

const ATTRIBUTION_KEY = "drop-analytics-attribution";
export function getAnalyticsAttribution(): AnalyticsAttribution {
  if (typeof window === "undefined")
    return { sessionId: crypto.randomUUID(), source: "direct", medium: "none", campaign: "" };
  try {
    const params = new URLSearchParams(window.location.search);
    const tagged = params.get("utm_source");
    const saved = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (saved && !tagged) return attributionSchema.parse(JSON.parse(saved));
    const referrerHost = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
    const value: AnalyticsAttribution = {
      sessionId: saved ? attributionSchema.parse(JSON.parse(saved)).sessionId : crypto.randomUUID(),
      source: (
        tagged || (referrerHost.includes("instagram") ? "instagram" : referrerHost || "direct")
      ).slice(0, 80),
      medium: (
        params.get("utm_medium") || (tagged ? "social" : referrerHost ? "referral" : "none")
      ).slice(0, 80),
      campaign: (params.get("utm_campaign") || "").slice(0, 100),
    };
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
    return value;
  } catch {
    return { sessionId: crypto.randomUUID(), source: "direct", medium: "none", campaign: "" };
  }
}

export function trackAnalyticsEvent(
  eventName: z.infer<typeof eventSchema>["eventName"],
  options: { path?: string; productId?: string } = {},
) {
  if (typeof window === "undefined") return;
  const attribution = getAnalyticsAttribution();
  void recordAnalyticsEvent({
    data: {
      ...attribution,
      eventName,
      path: (options.path ?? `${window.location.pathname}${window.location.search}`).slice(0, 300),
      productId: options.productId ?? null,
    },
  }).catch(() => undefined);
}

export type AnalyticsDashboard = {
  visitors: number;
  pageViews: number;
  productViews: number;
  addToCart: number;
  beginCheckout: number;
  purchases: number;
  revenue: number | string;
  sources: Array<{ source: string; visitors: number }>;
  campaigns: Array<{
    source: string;
    campaign: string;
    visitors: number;
    purchases: number;
    revenue: number | string;
  }>;
  daily: Array<{ day: string; visitors: number; carts: number }>;
};

const dashboardSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  days: z.number().int().min(1).max(365),
});
export const loadAnalyticsDashboard = createServerFn({ method: "POST" })
  .validator(dashboardSchema)
  .handler(async ({ data }) => {
    const supabase = serverClient();
    await requireMfaAdmin(supabase, data.accessToken);
    const { data: dashboard, error } = await supabase.rpc("analytics_dashboard", {
      p_days: data.days,
    });
    if (error) throw new Error(error.message);
    return dashboard as AnalyticsDashboard;
  });
