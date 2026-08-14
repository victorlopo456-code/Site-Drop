-- Faixa de avisos administrável no topo do site.
create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 80),
  accent boolean not null default false,
  position smallint not null check (position between 0 and 20),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists site_announcements_position_idx
  on public.site_announcements(position);
alter table public.site_announcements enable row level security;

drop policy if exists "Announcements are publicly readable" on public.site_announcements;
create policy "Announcements are publicly readable" on public.site_announcements
  for select to anon, authenticated using (enabled);
drop policy if exists "Admins manage announcements" on public.site_announcements;
create policy "Admins manage announcements" on public.site_announcements
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.site_announcements to anon, authenticated;
grant insert, update, delete on public.site_announcements to authenticated;

insert into public.site_announcements (text, accent, position, enabled)
select seed.text, seed.accent, seed.position, true
from (values
  ('Frete grátis acima de R$ 399', false, 0),
  ('10x sem juros', true, 1),
  ('Produtos originais', false, 2),
  ('Cupom DROP10 · 10% OFF', true, 3),
  ('Troca fácil em 30 dias', false, 4)
) as seed(text, accent, position)
where not exists (select 1 from public.site_announcements);
