-- Dados físicos usados para cotar o frete com transportadoras.
alter table public.products
  add column if not exists weight_kg numeric(8,3) not null default 0.5 check (weight_kg > 0 and weight_kg <= 100),
  add column if not exists width_cm integer not null default 20 check (width_cm between 1 and 200),
  add column if not exists height_cm integer not null default 10 check (height_cm between 1 and 200),
  add column if not exists length_cm integer not null default 30 check (length_cm between 1 and 200);

alter table public.orders
  add column if not exists shipping_service_id text,
  add column if not exists shipping_delivery_days integer check (shipping_delivery_days is null or shipping_delivery_days >= 0);
