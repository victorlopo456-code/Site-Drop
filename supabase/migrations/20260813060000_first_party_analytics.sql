-- Métricas próprias, sem IP, nome, e-mail ou dados de pagamento.
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  event_name text not null check (event_name in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout')),
  path text not null check (char_length(path) between 1 and 300),
  product_id text,
  source text not null default 'direct' check (char_length(source) between 1 and 80),
  medium text not null default 'none' check (char_length(medium) between 1 and 80),
  campaign text not null default '' check (char_length(campaign) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_session_idx on public.analytics_events(session_id, created_at desc);
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;
grant select, insert on public.analytics_events to service_role;
grant usage, select on sequence public.analytics_events_id_seq to service_role;

create or replace function public.record_analytics_event(
  p_session_id uuid,
  p_event_name text,
  p_path text,
  p_product_id text,
  p_source text,
  p_medium text,
  p_campaign text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.analytics_events (
    session_id, event_name, path, product_id, source, medium, campaign
  ) values (
    p_session_id, p_event_name, p_path, p_product_id, p_source, p_medium, p_campaign
  );
  if random() < 0.01 then
    delete from public.analytics_events where created_at < now() - interval '400 days';
  end if;
end;
$$;

revoke all on function public.record_analytics_event(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_analytics_event(uuid, text, text, text, text, text, text)
  to service_role;

alter table public.orders
  add column if not exists analytics_session_id uuid,
  add column if not exists marketing_source text not null default 'direct',
  add column if not exists marketing_medium text not null default 'none',
  add column if not exists marketing_campaign text not null default '';

create or replace function public.analytics_dashboard(p_days integer default 30)
returns jsonb
language sql
stable
security definer set search_path = ''
as $$
  with bounds as (
    select now() - make_interval(days => greatest(1, least(p_days, 365))) as since
  ),
  event_totals as (
    select
      count(distinct session_id) as visitors,
      count(*) filter (where event_name = 'page_view') as page_views,
      count(*) filter (where event_name = 'product_view') as product_views,
      count(*) filter (where event_name = 'add_to_cart') as add_to_cart,
      count(*) filter (where event_name = 'begin_checkout') as begin_checkout
    from public.analytics_events, bounds where created_at >= bounds.since
  ),
  order_totals as (
    select count(*) as purchases, coalesce(sum(total), 0) as revenue
    from public.orders, bounds
    where created_at >= bounds.since
      and status in ('payment_approved', 'payment_approved_stock_error')
  ),
  first_touch as (
    select distinct on (session_id) session_id, source, medium, campaign
    from public.analytics_events, bounds
    where created_at >= bounds.since and event_name = 'page_view'
    order by session_id, created_at
  ),
  sources as (
    select source, count(*) as visitors
    from first_touch group by source order by visitors desc, source limit 20
  ),
  campaign_visits as (
    select source, campaign, count(*) as visitors
    from first_touch group by source, campaign
  ),
  campaign_orders as (
    select marketing_source as source, marketing_campaign as campaign,
      count(*) as purchases, coalesce(sum(total), 0) as revenue
    from public.orders, bounds
    where created_at >= bounds.since
      and status in ('payment_approved', 'payment_approved_stock_error')
    group by marketing_source, marketing_campaign
    order by purchases desc, revenue desc limit 30
  ),
  campaigns as (
    select campaign_visits.source, campaign_visits.campaign, campaign_visits.visitors,
      coalesce(campaign_orders.purchases, 0) as purchases,
      coalesce(campaign_orders.revenue, 0) as revenue
    from campaign_visits
    left join campaign_orders using (source, campaign)
    order by campaign_visits.visitors desc, purchases desc limit 30
  ),
  daily as (
    select created_at::date as day,
      count(distinct session_id) as visitors,
      count(*) filter (where event_name = 'add_to_cart') as carts
    from public.analytics_events, bounds
    where created_at >= bounds.since
    group by created_at::date order by day
  )
  select jsonb_build_object(
    'visitors', event_totals.visitors,
    'pageViews', event_totals.page_views,
    'productViews', event_totals.product_views,
    'addToCart', event_totals.add_to_cart,
    'beginCheckout', event_totals.begin_checkout,
    'purchases', order_totals.purchases,
    'revenue', order_totals.revenue,
    'sources', coalesce((select jsonb_agg(to_jsonb(sources)) from sources), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(campaigns)) from campaigns), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(daily)) from daily), '[]'::jsonb)
  ) from event_totals cross join order_totals;
$$;

revoke all on function public.analytics_dashboard(integer) from public, anon, authenticated;
grant execute on function public.analytics_dashboard(integer) to service_role;
