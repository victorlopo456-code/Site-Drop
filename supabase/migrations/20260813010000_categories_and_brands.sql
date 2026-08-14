-- Categorias e marcas administráveis, preservando todos os valores já usados no catálogo.
create table if not exists public.product_categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 80),
  group_name text not null check (group_name in ('Skate', 'Vestuário', 'Acessórios')),
  image_url text not null default '' check (char_length(image_url) <= 1000),
  position integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 100),
  position integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.product_categories (slug, name, group_name, image_url, position) values
  ('shapes', 'Shapes', 'Skate', 'category:shapes', 0),
  ('rodas', 'Rodas', 'Skate', 'category:rodas', 1),
  ('trucks', 'Trucks', 'Skate', 'category:trucks', 2),
  ('rolamentos', 'Rolamentos', 'Skate', 'category:rodas', 3),
  ('lixas', 'Lixas', 'Skate', 'category:shapes', 4),
  ('parafusos', 'Parafusos', 'Skate', 'category:trucks', 5),
  ('tenis', 'Tênis', 'Vestuário', 'category:tenis', 6),
  ('camisetas', 'Camisetas', 'Vestuário', 'category:camisetas', 7),
  ('moletons', 'Moletons', 'Vestuário', 'category:moletons', 8),
  ('bones', 'Bonés', 'Vestuário', 'category:camisetas', 9),
  ('mochilas', 'Mochilas', 'Acessórios', 'category:moletons', 10),
  ('acessorios', 'Acessórios', 'Acessórios', 'category:trucks', 11)
on conflict (slug) do nothing;

-- Também absorve valores que o administrador eventualmente já tenha criado nos produtos.
insert into public.product_categories (slug, name, group_name, position)
select distinct p.category, initcap(replace(p.category, '-', ' ')), 'Acessórios', 100
from public.products p
where p.category ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
on conflict (slug) do nothing;

insert into public.product_brands (name, position) values
  ('Vans', 0), ('Nike SB', 1), ('Adidas', 2), ('DC', 3), ('Independent', 4),
  ('Santa Cruz', 5), ('Element', 6), ('Bones', 7), ('Creature', 8), ('Future', 9),
  ('Primitive', 10)
on conflict (name) do nothing;

insert into public.product_brands (name, position)
select distinct p.brand, 100 from public.products p
on conflict (name) do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_category_fk') then
    alter table public.products add constraint products_category_fk
      foreign key (category) references public.product_categories(slug)
      on update cascade on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_brand_fk') then
    alter table public.products add constraint products_brand_fk
      foreign key (brand) references public.product_brands(name)
      on update cascade on delete restrict;
  end if;
end $$;

create index if not exists product_categories_position_idx on public.product_categories(position);
create index if not exists product_brands_position_idx on public.product_brands(position);

alter table public.product_categories enable row level security;
alter table public.product_brands enable row level security;

drop policy if exists "Enabled categories are publicly readable" on public.product_categories;
create policy "Enabled categories are publicly readable" on public.product_categories
  for select to anon, authenticated using (enabled or (select public.is_admin()));
drop policy if exists "Admins manage categories" on public.product_categories;
create policy "Admins manage categories" on public.product_categories
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Enabled brands are publicly readable" on public.product_brands;
create policy "Enabled brands are publicly readable" on public.product_brands
  for select to anon, authenticated using (enabled or (select public.is_admin()));
drop policy if exists "Admins manage brands" on public.product_brands;
create policy "Admins manage brands" on public.product_brands
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.product_categories, public.product_brands to anon, authenticated;
grant insert, update, delete on public.product_categories, public.product_brands to authenticated;
