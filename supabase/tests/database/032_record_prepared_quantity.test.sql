-- M4-004A: successful incremental production and exact audit.
-- Expected RED until public.record_prepared_quantity(uuid,numeric) exists.
begin;
select no_plan();

insert into auth.users (id, aud, role, email) values
('c4000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4004-success-customer@example.test'),
('c4000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm4004-success-kitchen@example.test');

insert into public.profiles (id, display_name, role, active) values
('c4000000-0000-4000-8000-000000000001', 'Prepared Quantity Customer', 'CUSTOMER', true),
('c4000000-0000-4000-8000-000000000002', 'Prepared Quantity Kitchen', 'KITCHEN', true);

-- Inactive historical Business; KITCHEN needs no BusinessMembership.
insert into public.businesses (id, name, active) values
('c4100000-0000-4000-8000-000000000001', 'Prepared Quantity Historical Business', false);

insert into public.orders (
  id, business_id, created_by_user_id, status, requested_delivery_at, idempotency_key
) values (
  'c4200000-0000-4000-8000-000000000001',
  'c4100000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'RECEIVED', '2026-10-29T10:00:00Z',
  'c4300000-0000-4000-8000-000000000001'
);

insert into public.categories (id, name, active, display_order) values
('c4400000-0000-4000-8000-000000000001', 'Prepared Quantity Category', true, 0);

insert into public.products (
  id, category_id, name, unit_code, quantity_step, active, available
) values (
  'c4500000-0000-4000-8000-000000000001',
  'c4400000-0000-4000-8000-000000000001',
  'Prepared Quantity Product', 'KG', 0.125, true, true
);

insert into public.order_items (
  id, order_id, product_id, product_name_snapshot, unit_code_snapshot,
  quantity_step_snapshot, requested_quantity
) values
(
  'c4600000-0000-4000-8000-000000000001',
  'c4200000-0000-4000-8000-000000000001',
  'c4500000-0000-4000-8000-000000000001',
  'Historic KG Product', 'KG', 0.125, 2.500
),
(
  'c4600000-0000-4000-8000-000000000002',
  'c4200000-0000-4000-8000-000000000001',
  'c4500000-0000-4000-8000-000000000001',
  'Untouched KG Product', 'KG', 0.125, 1.000
);

-- Historical item increments must not depend on subsequent Product edits.
update public.products
set quantity_step = 0.500, available = false, name = 'Updated KG Product'
where id = 'c4500000-0000-4000-8000-000000000001';

select has_function(
  'public', 'record_prepared_quantity', array['uuid', 'numeric'],
  'record_prepared_quantity(uuid,numeric) exists'
);
select ok(
  pg_catalog.to_regprocedure('public.record_prepared_quantity(uuid,numeric)') is not null
  and coalesce(
    pg_catalog.has_function_privilege(
      'authenticated', pg_catalog.to_regprocedure('public.record_prepared_quantity(uuid,numeric)'), 'EXECUTE'
    ), false
  ),
  'authenticated may execute the trusted command'
);
select ok(
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon', pg_catalog.to_regprocedure('public.record_prepared_quantity(uuid,numeric)'), 'EXECUTE'
    ), true
  ),
  'anon may not execute the trusted command'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated','public.order_items','UPDATE'),
  'authenticated still cannot UPDATE OrderItems directly'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated','public.order_events','INSERT'),
  'authenticated still cannot insert audit events directly'
);
select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
   where p.oid=pg_catalog.to_regprocedure('public.record_prepared_quantity(uuid,numeric)')),
  'prepared quantity RPC is SECURITY DEFINER'
);
select is(
  (select p.proowner::regrole::text from pg_catalog.pg_proc as p
   where p.oid=pg_catalog.to_regprocedure('public.record_prepared_quantity(uuid,numeric)')),
  'postgres', 'trusted function owner is postgres'
);
-- PostgreSQL may serialize SET search_path = '' as search_path="".
-- Accept only representations of an empty path, never a non-empty schema list.
select ok(
  (select coalesce(
    'search_path='=any(p.proconfig)
    or 'search_path=""'=any(p.proconfig),
    false
  ) from pg_catalog.pg_proc as p
   where p.oid=pg_catalog.to_regprocedure('public.record_prepared_quantity(uuid,numeric)')),
  'SECURITY DEFINER sets an empty search_path'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"c4000000-0000-4000-8000-000000000002"}', true
);
select lives_ok(
  $$select public.start_order('c4200000-0000-4000-8000-000000000001')$$,
  'KITCHEN starts production with existing M4-003 command'
);
select lives_ok(
  $$select public.record_prepared_quantity('c4600000-0000-4000-8000-000000000001',0.375)$$,
  'KITCHEN records first partial increment using the historic 0.125 step'
);
select lives_ok(
  $$select public.record_prepared_quantity('c4600000-0000-4000-8000-000000000001',2.125)$$,
  'KITCHEN resolves all remaining quantity with a second increment'
);
reset role;

select is(
  (select status::text from public.orders where id='c4200000-0000-4000-8000-000000000001'),
  'IN_PROGRESS', 'quantity recording does not advance Order lifecycle'
);
select is(
  (select requested_quantity from public.order_items where id='c4600000-0000-4000-8000-000000000001'),
  2.500::numeric, 'original requested quantity is unchanged'
);
select is(
  (select prepared_quantity from public.order_items where id='c4600000-0000-4000-8000-000000000001'),
  2.500::numeric, 'cumulative prepared quantity equals the sum of both increments'
);
select is(
  (select unavailable_quantity from public.order_items where id='c4600000-0000-4000-8000-000000000001'),
  0::numeric, 'unavailable quantity remains untouched'
);
select is(
  (select requested_quantity - prepared_quantity - unavailable_quantity
   from public.order_items where id='c4600000-0000-4000-8000-000000000001'),
  0::numeric, 'remaining quantity is derived as exactly zero'
);
select is(
  (select prepared_quantity from public.order_items where id='c4600000-0000-4000-8000-000000000002'),
  0::numeric, 'a different OrderItem is not modified'
);
select ok(
  (select product_name_snapshot='Historic KG Product' and quantity_step_snapshot=0.125
   from public.order_items where id='c4600000-0000-4000-8000-000000000001'),
  'product snapshots remain unchanged despite catalog updates'
);
select is(
  (select count(*)::integer from public.order_events
   where order_id='c4200000-0000-4000-8000-000000000001' and event_type='QUANTITY_PREPARED'),
  2, 'each accepted increment produces exactly one audit event'
);
select is(
  (select count(*)::integer from public.order_events
   where order_id='c4200000-0000-4000-8000-000000000001' and event_type='PREPARATION_STARTED'),
  1, 'quantity operations do not duplicate PREPARATION_STARTED'
);
select is(
  (select pg_catalog.jsonb_agg(e.previous_value order by (e.new_value->>'prepared_quantity')::numeric)
   from public.order_events as e
   where e.order_id='c4200000-0000-4000-8000-000000000001'
     and e.event_type='QUANTITY_PREPARED'),
  '[{"prepared_quantity":0},{"prepared_quantity":0.375}]'::jsonb,
  'audit stores previous cumulative prepared quantity for every operation'
);
select is(
  (select pg_catalog.jsonb_agg(e.new_value order by (e.new_value->>'prepared_quantity')::numeric)
   from public.order_events as e
   where e.order_id='c4200000-0000-4000-8000-000000000001'
     and e.event_type='QUANTITY_PREPARED'),
  '[{"prepared_quantity":0.375},{"prepared_quantity":2.500}]'::jsonb,
  'audit stores new cumulative prepared quantities'
);
select is(
  (select pg_catalog.jsonb_agg(e.metadata order by (e.new_value->>'prepared_quantity')::numeric)
   from public.order_events as e
   where e.order_id='c4200000-0000-4000-8000-000000000001'
     and e.event_type='QUANTITY_PREPARED'),
  '[{"quantity_delta":0.375},{"quantity_delta":2.125}]'::jsonb,
  'audit preserves the exact positive delta for each accepted command'
);
select ok(
  (select pg_catalog.bool_and(
      e.order_item_id='c4600000-0000-4000-8000-000000000001'::uuid
      and e.actor_user_id='c4000000-0000-4000-8000-000000000002'::uuid
      and e.reason is null
    ) from public.order_events as e
    where e.order_id='c4200000-0000-4000-8000-000000000001'
      and e.event_type='QUANTITY_PREPARED'),
  'each event preserves the affected Item, trusted actor and no reason'
);
select ok(
  (select i.updated_at=(select max(e.occurred_at) from public.order_events as e
                           where e.order_item_id=i.id and e.event_type='QUANTITY_PREPARED')
   from public.order_items as i where i.id='c4600000-0000-4000-8000-000000000001'),
  'Item updated_at matches latest trusted event timestamp'
);
select * from finish();
rollback;
