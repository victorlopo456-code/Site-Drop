-- Cupons administráveis. A tabela não é exposta ao público; a validação acontece no servidor.
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  description text not null default '' check (char_length(description) <= 160),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  maximum_discount numeric(12,2) check (maximum_discount is null or maximum_discount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  first_order_only boolean not null default false,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (discount_type <> 'percentage' or discount_value <= 100)
);

create index if not exists coupons_enabled_dates_idx on public.coupons(enabled, starts_at, ends_at);

alter table public.coupons enable row level security;

drop policy if exists "Admins manage coupons" on public.coupons;
create policy "Admins manage coupons"
  on public.coupons for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select, insert, update, delete on public.coupons to authenticated;

-- Os cupons antigos continuam funcionando depois que esta migration for executada.
insert into public.coupons
  (code, description, discount_type, discount_value, minimum_order, enabled)
values
  ('DROP10', '10% de desconto', 'percentage', 10, 0, true),
  ('SKATE15', '15% de desconto', 'percentage', 15, 0, true),
  ('BLACK20', '20% de desconto', 'percentage', 20, 0, true)
on conflict (code) do nothing;
