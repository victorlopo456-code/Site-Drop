-- Recuperacao de carrinho e alertas de reposicao.
create table if not exists public.abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or char_length(email) between 3 and 320)
);

create index if not exists abandoned_carts_reminder_idx
  on public.abandoned_carts (updated_at)
  where email is not null and reminder_sent_at is null;

alter table public.abandoned_carts enable row level security;
revoke all on public.abandoned_carts from public, anon, authenticated;

create table if not exists public.stock_notifications (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  variant_id text,
  email text not null check (char_length(email) between 3 and 320),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_notifications_unique_idx
  on public.stock_notifications (product_id, coalesce(variant_id, ''), lower(email));
create index if not exists stock_notifications_pending_idx
  on public.stock_notifications (product_id)
  where sent_at is null;

alter table public.stock_notifications enable row level security;
revoke all on public.stock_notifications from public, anon, authenticated;
