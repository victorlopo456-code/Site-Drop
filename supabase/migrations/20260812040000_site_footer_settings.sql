-- Conteúdo editável do rodapé da loja.
create table if not exists public.site_settings (
  id text primary key check (id = 'footer'),
  store_description text not null check (char_length(store_description) between 1 and 500),
  phone text not null check (char_length(phone) between 1 and 40),
  email text not null check (char_length(email) between 3 and 254),
  address text not null check (char_length(address) between 1 and 300),
  payment_methods text not null check (char_length(payment_methods) between 1 and 300),
  instagram_url text not null default '' check (char_length(instagram_url) <= 500),
  youtube_url text not null default '' check (char_length(youtube_url) <= 500),
  company_document text not null default '' check (char_length(company_document) <= 80),
  copyright_text text not null default 'Todos os direitos reservados' check (char_length(copyright_text) between 1 and 160),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.site_settings enable row level security;

drop policy if exists "Site settings are publicly readable" on public.site_settings;
create policy "Site settings are publicly readable"
  on public.site_settings for select to anon, authenticated
  using (true);

drop policy if exists "Admins can insert site settings" on public.site_settings;
create policy "Admins can insert site settings"
  on public.site_settings for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
  on public.site_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

insert into public.site_settings (
  id, store_description, phone, email, address, payment_methods,
  instagram_url, youtube_url, company_document, copyright_text
)
values (
  'footer',
  'Skate, streetwear e lifestyle urbano. Curadoria de marcas originais, entrega para todo o Brasil e atendimento de quem anda de skate.',
  '(11) 4002-8922',
  'contato@dropskateshop.com.br',
  'Rua do Skate, 100 — São Paulo/SP',
  'PIX · Crédito · Débito · Boleto · Carteiras digitais',
  '',
  '',
  'CNPJ 00.000.000/0001-00',
  'Todos os direitos reservados'
)
on conflict (id) do nothing;
