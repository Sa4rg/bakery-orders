-- M4-001D: Support stable keyset ordering of Kitchen production Orders and
-- fetching each Order's Items. No data mutation or authorization change.
-- A status-leading index cannot supply global delivery ordering for multiple
-- statuses; filter status while traversing the delivery-order index.
create index if not exists orders_kitchen_delivery_queue_idx
  on public.orders (requested_delivery_at, created_at, id);

-- PostgreSQL does not automatically index the referencing side of an FK.
create index if not exists order_items_order_id_idx
  on public.order_items (order_id);
