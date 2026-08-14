-- Permite deixar um produto visível como esgotado sem apagar seu estoque.
alter table public.products
  add column if not exists sold_out boolean not null default false;
