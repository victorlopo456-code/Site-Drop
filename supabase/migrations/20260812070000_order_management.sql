-- Operação de pedidos, rastreamento, auditoria e devolução idempotente de estoque.
alter table public.orders
  add column if not exists fulfillment_status text not null default 'waiting_payment'
    check (fulfillment_status in ('waiting_payment', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'stock_review')),
  add column if not exists carrier text,
  add column if not exists tracking_code text,
  add column if not exists admin_notes text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists refund_id text,
  add column if not exists refunded_at timestamptz,
  add column if not exists stock_restored_at timestamptz;

-- O painel pode alterar somente dados operacionais; valores e dados financeiros continuam protegidos.
revoke update on public.orders from authenticated;
grant update (fulfillment_status, carrier, tracking_code, admin_notes, shipped_at, delivered_at, updated_at)
  on public.orders to authenticated;

create index if not exists orders_fulfillment_idx on public.orders(fulfillment_status, created_at desc);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  description text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events(order_id, created_at desc);
alter table public.order_events enable row level security;

drop policy if exists "Customers can read own order events" on public.order_events;
create policy "Customers can read own order events"
  on public.order_events for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_events.order_id
        and (orders.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

drop policy if exists "Admins can insert order events" on public.order_events;
create policy "Admins can insert order events"
  on public.order_events for insert to authenticated
  with check ((select public.is_admin()));

grant select, insert on public.order_events to authenticated;
grant usage, select on sequence public.order_events_id_seq to authenticated;

create or replace function public.restore_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_variant_index integer;
  v_variant_stock integer;
  v_variants jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.stock_deducted_at is null or v_order.stock_restored_at is not null then return true; end if;

  for v_item in
    select * from public.order_items where order_id = p_order_id order by product_id, id
  loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if not found then continue; end if;
    if v_item.variant_id is not null then
      v_variant_index := null;
      select (entry.ordinality - 1)::integer, coalesce((entry.value ->> 'stock')::integer, 0)
        into v_variant_index, v_variant_stock
      from jsonb_array_elements(v_product.variants) with ordinality as entry(value, ordinality)
      where entry.value ->> 'id' = v_item.variant_id limit 1;
      if v_variant_index is not null then
        v_variants := jsonb_set(
          v_product.variants,
          array[v_variant_index::text, 'stock'],
          to_jsonb(v_variant_stock + v_item.quantity),
          false
        );
        update public.products set
          variants = v_variants, stock = stock + v_item.quantity, updated_at = now()
        where id = v_item.product_id;
      end if;
    else
      update public.products set stock = stock + v_item.quantity, updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  update public.orders set stock_restored_at = now(), updated_at = now() where id = p_order_id;
  return true;
end;
$$;

revoke all on function public.restore_order_stock(uuid) from public;
revoke all on function public.restore_order_stock(uuid) from anon, authenticated;
grant execute on function public.restore_order_stock(uuid) to service_role;

-- Pedidos já pagos antes desta migration começam em preparação.
update public.orders
set fulfillment_status = case
  when status = 'payment_approved' then 'preparing'
  when status = 'payment_approved_stock_error' then 'stock_review'
  when status = 'payment_refunded' then 'refunded'
  when status = 'payment_cancelled' then 'cancelled'
  else fulfillment_status
end;
