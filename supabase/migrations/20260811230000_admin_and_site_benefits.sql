-- Perfis e autorização administrativa
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, full_name)
select id, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));

grant select on public.profiles to authenticated;

-- Faixa de benefícios exibida na home
create table if not exists public.site_benefits (
  id text primary key,
  title text not null check (char_length(title) between 1 and 60),
  description text not null check (char_length(description) between 1 and 120),
  icon text not null check (icon in ('truck', 'card', 'shield', 'coupon')),
  position smallint not null check (position between 0 and 20),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists site_benefits_position_idx
  on public.site_benefits(position);

alter table public.site_benefits enable row level security;

drop policy if exists "Benefits are publicly readable" on public.site_benefits;
create policy "Benefits are publicly readable"
  on public.site_benefits for select to anon, authenticated
  using (enabled);

drop policy if exists "Admins can read all benefits" on public.site_benefits;
create policy "Admins can read all benefits"
  on public.site_benefits for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can insert benefits" on public.site_benefits;
create policy "Admins can insert benefits"
  on public.site_benefits for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update benefits" on public.site_benefits;
create policy "Admins can update benefits"
  on public.site_benefits for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete benefits" on public.site_benefits;
create policy "Admins can delete benefits"
  on public.site_benefits for delete to authenticated
  using ((select public.is_admin()));

grant select on public.site_benefits to anon, authenticated;
grant insert, update, delete on public.site_benefits to authenticated;

insert into public.site_benefits (id, title, description, icon, position, enabled)
values
  ('free-shipping', 'Frete grátis', 'Em compras acima de R$ 399', 'truck', 0, true),
  ('installments', '10x sem juros', 'PIX, cartão e boleto', 'card', 1, true),
  ('secure-navigation', 'Navegação protegida', 'Cabeçalhos HTTP de segurança', 'shield', 2, true),
  ('first-order-coupon', 'Cupom DROP10', '10% OFF na primeira compra', 'coupon', 3, true)
on conflict (id) do nothing;

-- Após criar seu usuário, promova-o uma única vez pelo SQL Editor:
-- update public.profiles set role = 'admin' where id = 'UUID-DO-SEU-USUARIO';
