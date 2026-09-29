-- Preço de custo é informação interna e não deve ficar na tabela pública de produtos.
create table if not exists public.product_costs (
  product_id text primary key references public.products(id) on delete cascade,
  cost_price numeric(12,2) not null check (cost_price >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);

alter table public.product_costs enable row level security;
revoke all on public.product_costs from public, anon, authenticated;
grant select, insert, update, delete on public.product_costs to authenticated;

drop policy if exists "Admins manage private product costs" on public.product_costs;
create policy "Admins manage private product costs"
  on public.product_costs for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
