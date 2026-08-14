import { getSupabaseBrowserClient } from "@/lib/supabase";

export type CustomerAddress = {
  id: string;
  user_id: string;
  label: string;
  recipient: string;
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  is_default: boolean;
};

export type ReturnRequest = {
  id: string;
  order_id: string;
  request_type: "exchange" | "return";
  reason: string;
  status: "requested" | "reviewing" | "approved" | "rejected" | "completed" | "cancelled";
  admin_response: string | null;
  created_at: string;
};

export type OrderNotification = {
  id: number;
  order_id: string;
  event_type: string;
  description: string;
  created_at: string;
};

function client() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase;
}

export async function loadAddresses() {
  const { data, error } = await client()
    .from("customer_addresses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerAddress[];
}

export async function saveAddress(
  address: Omit<CustomerAddress, "id" | "user_id"> & { id?: string },
) {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sua sessão expirou.");
  const record = { ...address, user_id: auth.user.id, updated_at: new Date().toISOString() };
  const query = address.id
    ? supabase.from("customer_addresses").update(record).eq("id", address.id)
    : supabase.from("customer_addresses").insert(record);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function deleteAddress(id: string) {
  const { error } = await client().from("customer_addresses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadReturnRequests() {
  const { data, error } = await client()
    .from("return_requests")
    .select("id,order_id,request_type,reason,status,admin_response,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReturnRequest[];
}

export async function updateReturnRequest(
  id: string,
  status: ReturnRequest["status"],
  adminResponse: string,
) {
  const { error } = await client()
    .from("return_requests")
    .update({
      status,
      admin_response: adminResponse.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createReturnRequest(
  orderId: string,
  requestType: "exchange" | "return",
  reason: string,
) {
  const supabase = client();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sua sessão expirou.");
  const { error } = await supabase.from("return_requests").insert({
    user_id: auth.user.id,
    order_id: orderId,
    request_type: requestType,
    reason: reason.trim(),
  });
  if (error) {
    if (error.code === "23505")
      throw new Error("Já existe uma solicitação deste tipo para o pedido.");
    throw new Error(error.message);
  }
}

export async function loadOrderNotifications() {
  const { data, error } = await client()
    .from("order_events")
    .select("id,order_id,event_type,description,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderNotification[];
}
