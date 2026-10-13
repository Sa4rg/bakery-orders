-- M3-001A order foundation: approved lifecycle states and Order identity.

create type public.order_status as enum (
  'RECEIVED',
  'IN_PROGRESS',
  'READY',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED'
);

create table public.orders (
  id uuid not null default gen_random_uuid(),
  status public.order_status not null,
  constraint orders_pkey primary key (id)
);