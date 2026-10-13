-- M3-002A OrderItem foundation: identity, relationships and quantity fields.

create table public.order_items (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  product_id uuid not null,
  requested_quantity numeric(12,3) not null,
  prepared_quantity numeric(12,3) not null default 0,
  unavailable_quantity numeric(12,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint order_items_pkey
    primary key (id),

  constraint order_items_order_id_fkey
    foreign key (order_id)
    references public.orders (id)
    on delete restrict,

  constraint order_items_product_id_fkey
    foreign key (product_id)
    references public.products (id)
    on delete restrict
);