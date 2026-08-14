-- Catálogo persistente. A leitura é pública; toda escrita exige perfil admin.
create table if not exists public.products (
  id text primary key,
  sku text not null unique check (char_length(sku) between 1 and 80),
  slug text not null unique check (char_length(slug) between 1 and 180),
  name text not null check (char_length(name) between 1 and 200),
  brand text not null check (char_length(brand) between 1 and 100),
  category text not null check (char_length(category) between 1 and 80),
  price numeric(12,2) not null check (price >= 0),
  base_price numeric(12,2) check (base_price is null or base_price >= 0),
  compare_at numeric(12,2) check (compare_at is null or compare_at >= 0),
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  reviews integer not null default 0 check (reviews >= 0),
  stock integer not null default 0 check (stock >= 0),
  sold_out boolean not null default false,
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  promotion jsonb check (promotion is null or jsonb_typeof(promotion) = 'object'),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  description text not null default '',
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists products_category_idx on public.products(category);
create index if not exists products_brand_idx on public.products(brand);
create index if not exists products_sort_order_idx on public.products(sort_order);

alter table public.products enable row level security;

drop policy if exists "Products are publicly readable" on public.products;
create policy "Products are publicly readable"
  on public.products for select to anon, authenticated
  using (enabled);

drop policy if exists "Admins can read all products" on public.products;
create policy "Admins can read all products"
  on public.products for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can insert products" on public.products;
create policy "Admins can insert products"
  on public.products for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update products" on public.products;
create policy "Admins can update products"
  on public.products for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products"
  on public.products for delete to authenticated
  using ((select public.is_admin()));

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
