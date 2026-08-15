create table if not exists public.order_email_deliveries (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 180),
  recipient text not null,
  status text not null check (status in ('sending', 'sent')),
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, event_key)
);

alter table public.order_email_deliveries enable row level security;
create policy "Admins read email deliveries" on public.order_email_deliveries
  for select to authenticated using ((select public.is_admin()));
grant select on public.order_email_deliveries to authenticated;
