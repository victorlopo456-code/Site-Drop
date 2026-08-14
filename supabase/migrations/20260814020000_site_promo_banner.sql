create table if not exists public.site_promo_banners (
  id text primary key check (id = 'home-promo'),
  eyebrow text not null check (char_length(eyebrow) between 1 and 60),
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 300),
  coupon text not null default '' check (char_length(coupon) <= 40),
  button_label text not null check (char_length(button_label) between 1 and 60),
  button_url text not null check (char_length(button_url) between 1 and 300),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.site_promo_banners enable row level security;

create policy "Promo banners are publicly readable"
  on public.site_promo_banners for select to anon, authenticated using (true);
create policy "Admins can insert promo banners"
  on public.site_promo_banners for insert to authenticated with check ((select public.is_admin()));
create policy "Admins can update promo banners"
  on public.site_promo_banners for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.site_promo_banners to anon, authenticated;
grant insert, update on public.site_promo_banners to authenticated;

insert into public.site_promo_banners
  (id, eyebrow, title, description, coupon, button_label, button_url, enabled)
values
  ('home-promo', 'Semana DROP', 'Até 30% OFF em setups completos',
   'Monte seu skate com shape, truck, rodas e rolamentos com desconto progressivo.',
   'BLACK20', 'Ver promoções', '/promocoes', true)
on conflict (id) do nothing;
