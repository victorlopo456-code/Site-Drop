-- Expira pedidos não pagos após 48 horas, oculta-os do cliente e remove-os após 90 dias.
create extension if not exists pg_cron with schema pg_catalog;

alter table public.orders
  add column if not exists customer_hidden_at timestamptz;

create index if not exists orders_pending_expiration_idx
  on public.orders (created_at)
  where status = 'awaiting_payment';

create index if not exists orders_customer_visible_idx
  on public.orders (user_id, created_at desc)
  where customer_hidden_at is null;

create or replace function public.cleanup_expired_unpaid_orders()
returns table(cancelled_count integer, deleted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelled integer := 0;
  v_deleted integer := 0;
begin
  update public.orders
  set
    status = 'payment_cancelled',
    payment_status = 'cancelled',
    fulfillment_status = 'cancelled',
    customer_hidden_at = coalesce(customer_hidden_at, now()),
    updated_at = now()
  where status = 'awaiting_payment'
    and payment_status not in ('approved', 'authorized')
    and created_at <= now() - interval '48 hours';
  get diagnostics v_cancelled = row_count;

  delete from public.orders
  where status = 'payment_cancelled'
    and customer_hidden_at <= now() - interval '90 days'
    and paid_at is null;
  get diagnostics v_deleted = row_count;

  return query select v_cancelled, v_deleted;
end;
$$;

revoke all on function public.cleanup_expired_unpaid_orders() from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'cleanup-expired-unpaid-orders'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'cleanup-expired-unpaid-orders',
  '17 * * * *',
  'select public.cleanup_expired_unpaid_orders();'
);

-- Aplica a regra imediatamente aos pedidos que já venceram.
select * from public.cleanup_expired_unpaid_orders();
