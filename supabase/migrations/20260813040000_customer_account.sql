-- Recursos reais da área do cliente: endereços e solicitações pós-venda.

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  recipient text not null check (char_length(recipient) between 2 and 100),
  postal_code text not null check (postal_code ~ '^\d{8}$'),
  street text not null check (char_length(street) between 2 and 160),
  number text not null check (char_length(number) between 1 and 20),
  complement text not null default '' check (char_length(complement) <= 100),
  neighborhood text not null check (char_length(neighborhood) between 2 and 100),
  city text not null check (char_length(city) between 2 and 100),
  state text not null check (state ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_user_idx
  on public.customer_addresses(user_id, created_at desc);
alter table public.customer_addresses enable row level security;
drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses" on public.customer_addresses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.customer_addresses to authenticated;

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  request_type text not null check (request_type in ('exchange', 'return')),
  reason text not null check (char_length(reason) between 10 and 1000),
  status text not null default 'requested'
    check (status in ('requested', 'reviewing', 'approved', 'rejected', 'completed', 'cancelled')),
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, request_type)
);

create index if not exists return_requests_user_idx
  on public.return_requests(user_id, created_at desc);
alter table public.return_requests enable row level security;
drop policy if exists "Customers read own return requests" on public.return_requests;
create policy "Customers read own return requests" on public.return_requests
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );
drop policy if exists "Customers request returns for own orders" on public.return_requests;
create policy "Customers request returns for own orders" on public.return_requests
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.orders
      where orders.id = return_requests.order_id
        and orders.user_id = (select auth.uid())
        and orders.status in ('payment_approved', 'payment_approved_stock_error')
    )
  );
grant select, insert on public.return_requests to authenticated;
drop policy if exists "Admins update return requests" on public.return_requests;
create policy "Admins update return requests" on public.return_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.role = 'admin'
    )
  );
grant update (status, admin_response, updated_at) on public.return_requests to authenticated;

-- O cliente pode alterar apenas o próprio nome público; função e demais perfis continuam protegidos.
drop policy if exists "Users can update own profile name" on public.profiles;
create policy "Users can update own profile name" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
grant update (full_name, updated_at) on public.profiles to authenticated;
