import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

const staticPaths = [
  "",
  "/produtos",
  "/promocoes",
  "/sobre",
  "/contato",
  "/politica-de-entrega",
  "/trocas-e-devolucoes",
];

function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]!,
  );
}

export const Route = createFileRoute("/api/sitemap/xml")({
  server: {
    handlers: {
      GET: async () => {
        const origin = (process.env.SITE_URL ?? "https://drop-skate-shop.vercel.app").replace(
          /\/$/,
          "",
        );
        const url = process.env.VITE_SUPABASE_URL?.trim();
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        let products: Array<{ slug: string; updated_at: string | null }> = [];
        if (url && key) {
          const supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data } = await supabase
            .from("products")
            .select("slug,updated_at")
            .eq("enabled", true);
          products = data ?? [];
        }
        const entries = [
          ...staticPaths.map(
            (path) => `<url><loc>${escapeXml(`${origin}${path || "/"}`)}</loc></url>`,
          ),
          ...products.map(
            (product) =>
              `<url><loc>${escapeXml(`${origin}/produto/${product.slug}`)}</loc>${product.updated_at ? `<lastmod>${new Date(product.updated_at).toISOString()}</lastmod>` : ""}</url>`,
          ),
        ];
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`,
          {
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": "public, max-age=0, s-maxage=3600",
            },
          },
        );
      },
    },
  },
});
