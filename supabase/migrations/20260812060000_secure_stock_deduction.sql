-- Baixa transacional e idempotente de estoque após pagamento aprovado.
alter table public.order_items
  add column if not exists variant_id text,
  add column if not exists variant_size text,
  add column if not exists variant_color text;

create unique index if not exists order_items_product_variant_unique_idx
  on public.order_items(order_id, product_id, coalesce(variant_id, ''));

alter table public.orders
  add column if not exists stock_deducted_at timestamptz,
  add column if not exists stock_error text;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in (
    'awaiting_payment', 'payment_approved', 'payment_approved_stock_error',
    'payment_rejected', 'payment_cancelled', 'payment_refunded', 'payment_error'
  )
);

create or replace function public.confirm_paid_order_and_decrement_stock(
  p_order_id uuid,
  p_payment_id text,
  p_paid_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_variant_index integer;
  v_variant_stock integer;
  v_variants jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.stock_deducted_at is not null then return true; end if;

  -- Trava e valida todos os produtos antes de alterar qualquer quantidade.
  for v_item in
    select * from public.order_items where order_id = p_order_id order by product_id, id
  loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if not found or not v_product.enabled or v_product.sold_out then
      update public.orders set
        status = 'payment_approved_stock_error', payment_status = 'approved',
        mercado_pago_payment_id = p_payment_id, paid_at = p_paid_at,
        stock_error = 'Produto indisponível: ' || coalesce(v_item.name, v_item.sku), updated_at = now()
      where id = p_order_id;
      return false;
    end if;

    if v_item.variant_id is not null then
      v_variant_index := null;
      select (entry.ordinality - 1)::integer, coalesce((entry.value ->> 'stock')::integer, 0)
        into v_variant_index, v_variant_stock
      from jsonb_array_elements(v_product.variants) with ordinality as entry(value, ordinality)
      where entry.value ->> 'id' = v_item.variant_id limit 1;
      if v_variant_index is null or v_variant_stock < v_item.quantity then
        update public.orders set
          status = 'payment_approved_stock_error', payment_status = 'approved',
          mercado_pago_payment_id = p_payment_id, paid_at = p_paid_at,
          stock_error = 'Estoque insuficiente: ' || coalesce(v_item.name, v_item.sku), updated_at = now()
        where id = p_order_id;
        return false;
      end if;
    elsif v_product.stock < v_item.quantity then
      update public.orders set
        status = 'payment_approved_stock_error', payment_status = 'approved',
        mercado_pago_payment_id = p_payment_id, paid_at = p_paid_at,
        stock_error = 'Estoque insuficiente: ' || coalesce(v_item.name, v_item.sku), updated_at = now()
      where id = p_order_id;
      return false;
    end if;
  end loop;

  -- Com tudo validado e travado, realiza a baixa na mesma transação.
  for v_item in
    select * from public.order_items where order_id = p_order_id order by product_id, id
  loop
    select * into v_product from public.products where id = v_item.product_id for update;
    if v_item.variant_id is not null then
      select (entry.ordinality - 1)::integer, coalesce((entry.value ->> 'stock')::integer, 0)
        into v_variant_index, v_variant_stock
      from jsonb_array_elements(v_product.variants) with ordinality as entry(value, ordinality)
      where entry.value ->> 'id' = v_item.variant_id limit 1;
      v_variants := jsonb_set(
        v_product.variants,
        array[v_variant_index::text, 'stock'],
        to_jsonb(v_variant_stock - v_item.quantity),
        false
      );
      update public.products set
        variants = v_variants, stock = greatest(stock - v_item.quantity, 0), updated_at = now()
      where id = v_item.product_id;
    else
      update public.products set stock = stock - v_item.quantity, updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  update public.orders set
    status = 'payment_approved', payment_status = 'approved',
    mercado_pago_payment_id = p_payment_id, paid_at = p_paid_at,
    stock_deducted_at = now(), stock_error = null, updated_at = now()
  where id = p_order_id;
  return true;
end;
$$;

revoke all on function public.confirm_paid_order_and_decrement_stock(uuid, text, timestamptz) from public;
revoke all on function public.confirm_paid_order_and_decrement_stock(uuid, text, timestamptz) from anon, authenticated;
grant execute on function public.confirm_paid_order_and_decrement_stock(uuid, text, timestamptz) to service_role;
