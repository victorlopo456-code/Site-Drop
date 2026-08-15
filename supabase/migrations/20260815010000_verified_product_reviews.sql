create table if not exists public.product_reviews (
  id bigint generated always as identity primary key,
  product_id text not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text not null check (char_length(reviewer_name) between 1 and 100),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists product_reviews_public_idx
  on public.product_reviews(product_id, status, created_at desc);
alter table public.product_reviews enable row level security;

create or replace function public.can_review_product(p_product_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.user_id = (select auth.uid())
      and o.status = 'payment_approved'
      and oi.product_id = p_product_id
      and not exists (
        select 1 from public.product_reviews pr
        where pr.user_id = (select auth.uid())
          and pr.product_id = p_product_id
          and pr.status in ('pending', 'approved')
      )
  );
$$;
revoke all on function public.can_review_product(text) from public;
grant execute on function public.can_review_product(text) to authenticated;

create policy "Approved reviews are public" on public.product_reviews
  for select to anon, authenticated using (status = 'approved');
create policy "Customers read own reviews" on public.product_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Admins read all reviews" on public.product_reviews
  for select to authenticated using ((select public.is_admin()));
create policy "Verified customers create reviews" on public.product_reviews
  for insert to authenticated with check (
    user_id = (select auth.uid()) and (select public.can_review_product(product_id))
  );
create policy "Customers update own pending reviews" on public.product_reviews
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "Admins moderate reviews" on public.product_reviews
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.product_reviews to anon, authenticated;
grant insert, update on public.product_reviews to authenticated;
