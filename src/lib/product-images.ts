import { getSupabaseBrowserClient } from "@/lib/supabase";

export const PRODUCT_IMAGES_BUCKET = "product-images";
// Mantém o multipart abaixo do limite de corpo das funções da Vercel.
export const MAX_PRODUCT_IMAGE_SIZE = 4 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const extensionByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadProductImage(file: File): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não está configurado.");
  if (!extensionByType[file.type]) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size > MAX_PRODUCT_IMAGE_SIZE) throw new Error("A imagem deve ter no máximo 4 MB.");

  const [{ data: auth }, { data: session }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  if (!auth.user || !session.session?.access_token) {
    throw new Error("Entre novamente com a conta administradora.");
  }

  const form = new FormData();
  form.set("image", file, file.name);
  const response = await fetch("/api/admin/product-image", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.session.access_token}` },
    body: form,
  });
  const result = (await response.json().catch(() => null)) as {
    url?: string;
    error?: string;
  } | null;
  if (!response.ok || !result?.url) {
    throw new Error(result?.error || "Não foi possível enviar a imagem.");
  }
  return result.url;
}

export function productImagePath(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  try {
    const url = new URL(publicUrl);
    const index = url.pathname.indexOf(marker);
    return index < 0 ? null : decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export async function removeProductImages(publicUrls: string[]) {
  const paths = publicUrls.map(productImagePath).filter((path): path is string => Boolean(path));
  if (!paths.length) return;

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
  if (error) console.warn("Não foi possível remover uma imagem do Storage:", error.message);
}
