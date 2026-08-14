import { getSupabaseBrowserClient } from "@/lib/supabase";

export const PRODUCT_IMAGES_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
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
  if (file.size > MAX_PRODUCT_IMAGE_SIZE) throw new Error("A imagem deve ter no máximo 5 MB.");

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Entre novamente com a conta administradora.");

  const extension = extensionByType[file.type];
  const unique = crypto.randomUUID();
  const path = `${auth.user.id}/${Date.now()}-${unique}.${extension}`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
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
