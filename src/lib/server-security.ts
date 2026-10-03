import type { SupabaseClient } from "@supabase/supabase-js";

export async function enforcePublicRateLimit(
  supabase: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");
  // Vercel overwrites this header. Do not trust arbitrary X-Forwarded-For or
  // visitor IDs supplied by the browser as the only protection against abuse.
  const address =
    process.env.VERCEL === "1"
      ? getRequestHeader("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : getRequestIP({ xForwardedFor: false });
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Proteção temporariamente indisponível.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(address || "unknown-client"),
  );
  const fingerprint = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  await enforceRateLimit(supabase, `ip:${fingerprint}`, bucket, limit, windowSeconds);
}

export async function requireMfaAdmin(supabase: SupabaseClient, accessToken: string) {
  const [{ data: auth, error: authError }, { data: claims, error: claimsError }] =
    await Promise.all([supabase.auth.getUser(accessToken), supabase.auth.getClaims(accessToken)]);
  if (authError || claimsError || !auth.user || !claims) {
    throw new Error("Sessão inválida ou expirada.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin") {
    throw new Error("Acesso permitido somente para administradores.");
  }
  if (claims.claims.aal !== "aal2") {
    throw new Error("Confirme o código de segurança para administrar a loja.");
  }
  return auth.user.id;
}

export async function enforceRateLimit(
  supabase: SupabaseClient,
  key: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_key: key,
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Falha de modo seguro: sem a migration, endpoints sensíveis ficam bloqueados.
    if (error.code === "PGRST202" || error.code === "42883") {
      console.error("Rate limit não está instalado no Supabase.", error);
      throw new Error("Proteção temporariamente indisponível. Tente novamente em instantes.");
    }
    throw new Error("Não foi possível validar o limite de segurança.");
  }
  if (data !== true) {
    throw new Error("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.");
  }
}
