-- M4-001D: presence and shape of indexes used by Kitchen queue reads.
begin;

select plan(6);

select ok(
  pg_catalog.to_regclass('public.orders_kitchen_delivery_queue_idx') is not null,
  'Kitchen Orders delivery index exists'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'orders'
      and indexname = 'orders_kitchen_delivery_queue_idx'
      and indexdef like '%(requested_delivery_at, created_at, id)%'
  ),
  'Kitchen Orders index matches delivery-first keyset order'
);

select ok(
  pg_catalog.to_regclass('public.order_items_order_id_idx') is not null,
  'OrderItems parent index exists'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'order_items'
      and indexname = 'order_items_order_id_idx'
      and indexdef like '%(order_id)%'
  ),
  'OrderItems index includes its parent FK'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.orders'::pg_catalog.regclass)
  and
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.order_items'::pg_catalog.regclass),
  'Orders and Items retain RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.orders', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.order_items', 'UPDATE'),
  'authenticated still has no direct production UPDATE privilege'
);

select * from finish();
rollback;
