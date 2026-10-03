-- Security audit: enforce MFA consistently and prevent customer-controlled
-- inserts/updates from bypassing moderation or post-sale workflows.
begin;

revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, updated_at) on public.profiles to authenticated;

-- Customer RLS restricts rows, not columns. Keep internal notes outside the
-- orders table, whose rows are readable by the corresponding customer.
create table if not exists public.order_admin_notes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.order_admin_notes enable row level security;
revoke all on public.order_admin_notes from public, anon, authenticated;
grant select, insert, update, delete on public.order_admin_notes to authenticated;
grant all on public.order_admin_notes to service_role;
drop policy if exists "MFA admins manage order notes" on public.order_admin_notes;
create policy "MFA admins manage order notes" on public.order_admin_notes
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.order_admin_notes (order_id, notes, updated_at)
  select id, admin_notes, updated_at from public.orders where admin_notes is not null
  on conflict (order_id) do update set notes = excluded.notes, updated_at = excluded.updated_at;
update public.orders set admin_notes = null where admin_notes is not null;

create or replace function public.reject_public_order_notes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.admin_notes is not null then
    raise exception 'Internal notes must be stored in order_admin_notes';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_public_order_notes() from public, anon, authenticated;
drop trigger if exists reject_public_order_notes on public.orders;
create trigger reject_public_order_notes before insert or update on public.orders
  for each row execute function public.reject_public_order_notes();

drop policy if exists "Verified customers create reviews" on public.product_reviews;
create policy "Verified customers create reviews" on public.product_reviews
  for insert to authenticated with check (
    user_id = (select auth.uid()) and status = 'pending'
    and (select public.can_review_product(product_id))
  );

create or replace function public.protect_review_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.id is distinct from old.id
       or new.product_id is distinct from old.product_id
       or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Review identity cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_review_identity() from public, anon, authenticated;
drop trigger if exists protect_review_identity on public.product_reviews;
create trigger protect_review_identity before update on public.product_reviews
  for each row execute function public.protect_review_identity();

drop policy if exists "Customers read own return requests" on public.return_requests;
create policy "Customers read own return requests" on public.return_requests
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Customers request returns for own orders" on public.return_requests;
create policy "Customers request returns for own orders" on public.return_requests
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'requested' and admin_response is null
    and exists (
      select 1 from public.orders
      where orders.id = return_requests.order_id
        and orders.user_id = (select auth.uid())
        and orders.status in ('payment_approved', 'payment_approved_stock_error')
    )
  );

drop policy if exists "Admins update return requests" on public.return_requests;
create policy "Admins update return requests" on public.return_requests
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Serialize payment transitions with the row lock taken by UPDATE/RPC. This
-- closes the race between a refund and an older payment confirmation.
create or replace function public.protect_order_payment_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'payment_refunded' or old.stock_restored_at is not null then
    if new.status is distinct from old.status or new.payment_status is distinct from old.payment_status then
      raise exception 'A refunded order cannot be reactivated';
    end if;
  elsif old.payment_status = 'approved' then
    if new.payment_status not in ('approved', 'refunded', 'charged_back') then
      raise exception 'An approved payment cannot be replaced by a pending or failed attempt';
    end if;
  end if;
  if old.payment_status in ('approved', 'refunded', 'charged_back')
     and old.mercado_pago_payment_id is not null
     and new.mercado_pago_payment_id is distinct from old.mercado_pago_payment_id then
    raise exception 'The confirmed payment identifier cannot be replaced';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_order_payment_state() from public, anon, authenticated;
drop trigger if exists protect_order_payment_state on public.orders;
create trigger protect_order_payment_state before update on public.orders
  for each row execute function public.protect_order_payment_state();

-- Reserve limited coupons while a payment is pending. Checking only paid
-- orders in application code allows multiple simultaneous checkouts to exceed
-- a coupon's usage or first-purchase limit. Locking the coupon serializes inserts.
create or replace function public.reserve_order_coupon()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_coupon public.coupons%rowtype;
  v_count integer;
begin
  if new.coupon_code is null then return new; end if;
  select * into v_coupon from public.coupons where code = new.coupon_code for update;
  if not found or not v_coupon.enabled
     or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
     or (v_coupon.ends_at is not null and v_coupon.ends_at < now())
     or new.subtotal < v_coupon.minimum_order then
    raise exception 'Cupom indisponível para este pedido';
  end if;
  if v_coupon.usage_limit is not null then
    select count(*) into v_count from public.orders
      where coupon_code = new.coupon_code and (
        status in ('payment_approved', 'payment_approved_stock_error')
        or (status = 'awaiting_payment' and created_at > now() - interval '48 hours')
      );
    if v_count >= v_coupon.usage_limit then
      raise exception 'O limite de uso deste cupom foi atingido ou está reservado em pedidos pendentes';
    end if;
  end if;
  if v_coupon.per_customer_limit is not null then
    select count(*) into v_count from public.orders
      where coupon_code = new.coupon_code and user_id = new.user_id and (
        status in ('payment_approved', 'payment_approved_stock_error')
        or (status = 'awaiting_payment' and created_at > now() - interval '48 hours')
      );
    if v_count >= v_coupon.per_customer_limit then
      raise exception 'Você já atingiu o limite deste cupom ou possui um pedido pendente com ele';
    end if;
  end if;
  if v_coupon.first_order_only and exists (
    select 1 from public.orders where user_id = new.user_id and (
      status in ('payment_approved', 'payment_approved_stock_error')
      or (status = 'awaiting_payment' and created_at > now() - interval '48 hours')
    )
  ) then
    raise exception 'Este cupom é válido somente na primeira compra e você já possui um pedido';
  end if;
  return new;
end;
$$;
revoke all on function public.reserve_order_coupon() from public, anon, authenticated;
drop trigger if exists reserve_order_coupon on public.orders;
create trigger reserve_order_coupon before insert on public.orders
  for each row execute function public.reserve_order_coupon();

commit;
