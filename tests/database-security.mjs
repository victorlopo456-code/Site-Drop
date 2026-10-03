import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const customer = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const admin = "00000000-0000-4000-8000-000000000003";
const order = "00000000-0000-4000-8000-000000000010";
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
  create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role'; $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key references auth.users(id), role text, full_name text, updated_at timestamptz);
  alter table public.profiles enable row level security;
  create policy own_profile on public.profiles for select to authenticated using (id=auth.uid());
  grant select on public.profiles to authenticated;
  create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
  $$;
`);
for (const filename of [
  "20260812010000_products_catalog.sql",
  "20260812050000_orders_and_payments.sql",
  "20260812060000_secure_stock_deduction.sql",
  "20260812070000_order_management.sql",
  "20260813030000_security_hardening.sql",
  "20260813040000_customer_account.sql",
  "20260813020000_managed_coupons.sql",
  "20260815010000_verified_product_reviews.sql",
])
  await db.exec(
    await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8"),
  );
await db.exec(`
  insert into auth.users values ('${customer}'),('${other}'),('${admin}');
  insert into public.profiles values ('${customer}','customer','Customer',now()),('${other}','customer','Other',now()),('${admin}','admin','Admin',now());
  insert into public.products(id,sku,slug,name,brand,category,price,stock) values
    ('audit-product','SKU1','audit-product','Product','Brand','Skate',100,10),
    ('audit-second','SKU2','audit-second','Second','Brand','Skate',100,10),
    ('audit-other','SKU3','audit-other','Other','Brand','Skate',100,10);
  insert into public.orders(id,user_id,status,payment_status,subtotal,total,shipping_method,buyer_name,buyer_email,buyer_cpf,shipping_address,admin_notes,mercado_pago_payment_id,stock_deducted_at)
    values ('${order}','${customer}','payment_approved','approved',100,100,'Pickup','Customer','test@example.invalid','00000000000','{}','Internal confidential note','123',now());
  insert into public.order_items(order_id,product_id,sku,name,quantity,unit_price,line_total)
    values ('${order}','audit-product','SKU1','Product',1,50,50),('${order}','audit-second','SKU2','Second',1,50,50);
  insert into public.product_reviews(product_id,user_id,reviewer_name,rating,comment)
    values ('audit-product','${customer}','Customer',5,'Existing pending review');
  insert into public.return_requests(user_id,order_id,request_type,reason)
    values ('${customer}','${order}','exchange','Request a product exchange');
`);

async function asUser(userId, aal, sql, role = "authenticated") {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role, aal }),
    ]);
    await db.exec(`set local role ${role}`);
    return await db.query(sql);
  } finally {
    await db.exec("rollback");
  }
}
async function allowed(name, callback) {
  await callback();
  console.log(`PASS ${name}`);
}
async function denied(name, callback) {
  await assert.rejects(callback);
  console.log(`PASS ${name}`);
}
const autoApprove = `insert into public.product_reviews(product_id,user_id,reviewer_name,rating,comment,status) values ('audit-second','${customer}','Customer',5,'Bypass moderation test','approved')`;
const moveReview =
  "update public.product_reviews set product_id='audit-other' where product_id='audit-product'";
const autoApproveReturn = `insert into public.return_requests(user_id,order_id,request_type,reason,status,admin_response) values ('${customer}','${order}','return','Bypass return processing','approved','Customer approved own return')`;
// Reproduce the vulnerabilities against the original migrations, rolling back
// each attempt; then execute the actual fix and verify the same attempts fail.
await allowed("original rules reproduce self-approved reviews", () =>
  asUser(customer, "aal1", autoApprove),
);
await allowed("original rules reproduce moving reviews to an unpurchased product", () =>
  asUser(customer, "aal1", moveReview),
);
await allowed("original rules reproduce self-approved returns", () =>
  asUser(customer, "aal1", autoApproveReturn),
);
const originalAdminRead = await asUser(admin, "aal1", "select * from public.return_requests");
assert.equal(originalAdminRead.rows.length, 1);
console.log("PASS original rules reproduce admin access without MFA");
const legacyNotes = await asUser(customer, "aal1", "select admin_notes from public.orders");
assert.equal(legacyNotes.rows[0].admin_notes, "Internal confidential note");
console.log("PASS original rules reproduce internal note disclosure to customer");
await db.exec(
  await readFile(
    new URL("../supabase/migrations/20261003010000_audit_access_controls.sql", import.meta.url),
    "utf8",
  ),
);
await denied("customer cannot approve own review", () => asUser(customer, "aal1", autoApprove));
await denied("customer cannot move a review to another product", () =>
  asUser(customer, "aal1", moveReview),
);
await denied("customer cannot approve own return", () =>
  asUser(customer, "aal1", autoApproveReturn),
);
await denied("customer cannot elevate profile role", () =>
  asUser(customer, "aal1", "update public.profiles set role='admin'"),
);
await allowed("verified customer can submit a pending review", () =>
  asUser(customer, "aal1", autoApprove.replace("'approved'", "'pending'")),
);
await allowed("MFA admin can moderate reviews", () =>
  asUser(
    admin,
    "aal2",
    "update public.product_reviews set status='approved' where product_id='audit-product'",
  ),
);
assert.equal((await asUser(admin, "aal1", "select * from public.return_requests")).rows.length, 0);
console.log("PASS admin without MFA cannot read customer returns");
assert.equal((await asUser(admin, "aal2", "select * from public.return_requests")).rows.length, 1);
console.log("PASS MFA admin can read customer returns");
assert.equal((await asUser(other, "aal1", "select * from public.orders")).rows.length, 0);
console.log("PASS customer cannot read another customer's orders");
assert.equal(
  (await asUser(customer, "aal1", "select admin_notes from public.orders")).rows[0].admin_notes,
  null,
);
assert.equal(
  (await asUser(customer, "aal1", "select * from public.order_admin_notes")).rows.length,
  0,
);
assert.equal(
  (await asUser(admin, "aal1", "select * from public.order_admin_notes")).rows.length,
  0,
);
assert.equal(
  (await asUser(admin, "aal2", "select * from public.order_admin_notes")).rows[0].notes,
  "Internal confidential note",
);
console.log("PASS internal notes migrated and accessible only with admin MFA");
await denied("approved payment cannot be downgraded", () =>
  asUser(
    null,
    "aal1",
    `update public.orders set status='payment_rejected',payment_status='rejected' where id='${order}'`,
    "service_role",
  ),
);
await denied("confirmed payment ID cannot be replaced", () =>
  asUser(
    null,
    "aal1",
    `update public.orders set mercado_pago_payment_id='456' where id='${order}'`,
    "service_role",
  ),
);
await db.exec(
  `update public.orders set status='payment_refunded',payment_status='refunded',stock_restored_at=now() where id='${order}'`,
);
await denied("refunded order cannot be reactivated", () =>
  asUser(
    null,
    "aal1",
    `update public.orders set status='payment_approved',payment_status='approved' where id='${order}'`,
    "service_role",
  ),
);
await denied("anonymous caller cannot consume service rate limits", () =>
  asUser(null, "aal1", "select public.consume_api_rate_limit('key','test',2,60)", "anon"),
);
await db.exec(
  "insert into public.coupons(code,discount_type,discount_value,usage_limit) values ('LIMIT1','percentage',10,1)",
);
const couponOrder = (
  id,
  user,
) => `insert into public.orders(id,user_id,subtotal,total,coupon_code,shipping_method,buyer_name,buyer_email,buyer_cpf,shipping_address)
  values ('${id}','${user}',100,90,'LIMIT1','Pickup','Customer','test@example.invalid','00000000000','{}')`;
await db.exec(couponOrder("00000000-0000-4000-8000-000000000020", customer));
await denied("pending payment reserves a coupon's last usage", () =>
  db.exec(couponOrder("00000000-0000-4000-8000-000000000021", other)),
);
await db.exec(
  "update public.orders set status='payment_cancelled' where id='00000000-0000-4000-8000-000000000020'",
);
await allowed("cancelled payment releases the reserved coupon", () =>
  db.exec(couponOrder("00000000-0000-4000-8000-000000000021", other)),
);
await db.close();
