-- Pedidos e itens gerados exclusivamente pelo backend do checkout.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  user_id uuid not null references auth.users(id),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'payment_approved', 'payment_rejected', 'payment_cancelled', 'payment_refunded', 'payment_error')),
  payment_status text not null default 'pending',
  mercado_pago_preference_id text unique,
  mercado_pago_payment_id text unique,
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  total numeric(12,2) not null check (total >= 0),
  coupon_code text,
  shipping_method text not null,
  buyer_name text not null,
  buyer_email text not null,
  buyer_cpf text not null,
  shipping_address jsonb not null check (jsonb_typeof(shipping_address) = 'object'),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  sku text not null,
  name text not null,
  image_url text not null default '',
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists order_items_order_idx on public.order_items(order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Customers can read own orders" on public.orders;
create policy "Customers can read own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
  on public.orders for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Customers can read own order items" on public.order_items;
create policy "Customers can read own order items"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

grant select on public.orders, public.order_items to authenticated;
grant update on public.orders to authenticated;
