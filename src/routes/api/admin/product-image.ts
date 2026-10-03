import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { MAX_PRODUCT_IMAGE_SIZE, PRODUCT_IMAGES_BUCKET } from "@/lib/product-images";
import { enforceRateLimit, requireMfaAdmin } from "@/lib/server-security";
import { readLimitedBody, RequestBodyTooLarge } from "@/lib/request-body";

const imageTypes = {
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  png: { mime: "image/png", extension: "png" },
  webp: { mime: "image/webp", extension: "webp" },
} as const;

function detectedImageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return imageTypes.jpeg;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return imageTypes.png;
  }
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return imageTypes.webp;
  }
  return null;
}

export const Route = createFileRoute("/api/admin/product-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
        const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!supabaseUrl || !serviceRole) {
          return Response.json({ error: "Backend não configurado." }, { status: 503 });
        }

        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";
        if (!accessToken) {
          return Response.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
        }

        const declaredLength = Number(request.headers.get("content-length") ?? 0);
        if (declaredLength > MAX_PRODUCT_IMAGE_SIZE + 256 * 1024) {
          return Response.json({ error: "A imagem deve ter no máximo 4 MB." }, { status: 413 });
        }

        const supabase = createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        let adminId: string;
        try {
          adminId = await requireMfaAdmin(supabase, accessToken);
          await enforceRateLimit(supabase, adminId, "product-image-upload", 30, 10 * 60);
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Acesso negado." },
            { status: 403 },
          );
        }

        let image: File;
        try {
          const bytes = await readLimitedBody(request, MAX_PRODUCT_IMAGE_SIZE + 256 * 1024);
          const form = await new Response(bytes, {
            headers: { "Content-Type": request.headers.get("content-type") ?? "" },
          }).formData();
          const value = form.get("image");
          if (!(value instanceof File)) throw new Error("Arquivo ausente.");
          image = value;
        } catch (error) {
          if (error instanceof RequestBodyTooLarge) {
            return Response.json({ error: "A imagem deve ter no máximo 4 MB." }, { status: 413 });
          }
          return Response.json({ error: "Envie uma imagem válida." }, { status: 400 });
        }
        if (image.size <= 0 || image.size > MAX_PRODUCT_IMAGE_SIZE) {
          return Response.json({ error: "A imagem deve ter no máximo 4 MB." }, { status: 413 });
        }

        const content = new Uint8Array(await image.arrayBuffer());
        const detected = detectedImageType(content);
        if (!detected || image.type !== detected.mime) {
          return Response.json(
            { error: "O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP." },
            { status: 415 },
          );
        }

        const path = `${adminId}/${Date.now()}-${crypto.randomUUID()}.${detected.extension}`;
        const { error: uploadError } = await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .upload(path, content, {
            cacheControl: "31536000",
            contentType: detected.mime,
            upsert: false,
          });
        if (uploadError) {
          console.error("Falha no upload seguro de imagem:", uploadError);
          return Response.json({ error: "Não foi possível salvar a imagem." }, { status: 500 });
        }

        const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
        return Response.json({ url: data.publicUrl }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
