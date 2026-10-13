-- M3-001B Order ownership, delivery and idempotency fields.

create sequence public.orders_order_number_seq;

alter table public.orders
  add column order_number bigint not null
    default nextval('public.orders_order_number_seq'),
  add column business_id uuid not null,
  add column created_by_user_id uuid not null,
  add column requested_delivery_at timestamptz not null,
  add column delivery_address_snapshot text,
  add column customer_notes text,
  add column idempotency_key uuid not null,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

alter sequence public.orders_order_number_seq
  owned by public.orders.order_number;