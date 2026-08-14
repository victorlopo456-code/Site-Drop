import type { SupabaseClient } from "@supabase/supabase-js";

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
    // Mantém a loja funcional durante a implantação, antes da migration ser executada.
    if (error.code === "PGRST202" || error.code === "42883") {
      console.warn("Rate limit ainda não ativado no Supabase.");
      return;
    }
    throw new Error("Não foi possível validar o limite de segurança.");
  }
  if (data !== true) {
    throw new Error("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.");
  }
}
