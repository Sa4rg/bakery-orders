-- M3-002C Preserve historical Product data on confirmed OrderItems.

alter table public.order_items
  add column product_name_snapshot text not null,
  add column unit_code_snapshot text not null,
  add column quantity_step_snapshot numeric(12,3) not null;