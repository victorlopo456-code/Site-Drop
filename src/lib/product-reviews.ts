import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const reviewSchema = z.object({
  id: z.number().int(),
  product_id: z.string(),
  user_id: z.string().uuid(),
  reviewer_name: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  created_at: z.string(),
});
export type ProductReview = z.infer<typeof reviewSchema>;

function client() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase;
}

export async function loadProductReviews(productId: string) {
  const { data, error } = await client()
    .from("product_reviews")
    .select("id,product_id,user_id,reviewer_name,rating,comment,status,created_at")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (error) return [];
  const parsed = z.array(reviewSchema).safeParse(data);
  return parsed.success ? parsed.data : [];
}

export async function canReviewProduct(productId: string) {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data, error } = await supabase.rpc("can_review_product", { p_product_id: productId });
  return !error && data === true;
}

export async function submitProductReview(productId: string, rating: number, comment: string) {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Entre na sua conta para avaliar.");
  const reviewerName =
    typeof auth.user.user_metadata.full_name === "string"
      ? auth.user.user_metadata.full_name.trim()
      : "Cliente DROP";
  const { error } = await supabase.from("product_reviews").upsert(
    {
      product_id: productId,
      user_id: auth.user.id,
      reviewer_name: reviewerName || "Cliente DROP",
      rating,
      comment: comment.trim(),
      status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function loadReviewsForAdmin() {
  const { data, error } = await client()
    .from("product_reviews")
    .select("id,product_id,user_id,reviewer_name,rating,comment,status,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return z.array(reviewSchema).parse(data ?? []);
}

export async function moderateReview(id: number, status: ProductReview["status"]) {
  const { error } = await client()
    .from("product_reviews")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
