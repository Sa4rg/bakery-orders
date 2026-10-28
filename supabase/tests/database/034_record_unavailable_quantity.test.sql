-- M4-005A: successful incremental unavailability and its mandatory audit reasons.
-- Expected RED until public.record_unavailable_quantity(uuid,numeric,text) exists.
begin;
select no_plan();

insert into auth.users (id, aud, role, email) values
('e5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4005-success-customer@example.test'),
('e5000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm4005-success-kitchen@example.test'),
('e5000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'm4005-success-manager@example.test');

insert into public.profiles (id, display_name, role, active) values
('e5000000-0000-4000-8000-000000000001', 'Unavailable Success Customer', 'CUSTOMER', true),
('e5000000-0000-4000-8000-000000000002', 'Unavailable Success Kitchen', 'KITCHEN', true),
('e5000000-0000-4000-8000-000000000003', 'Unavailable Success Manager', 'MANAGER', true);

-- Historical Business is inactive. KITCHEN does not need membership.
insert into public.businesses (id, name, active) values
('e5100000-0000-4000-8000-000000000001', 'Unavailable Historical Business', false);

insert into public.orders (
  id, business_id, created_by_user_id, status, requested_delivery_at, idempotency_key
) values (
  'e5200000-0000-4000-8000-000000000001',
  'e5100000-0000-4000-8000-000000000001',
  'e5000000-0000-4000-8000-000000000001',
  'RECEIVED', '2026-10-30T10:00:00Z',
  'e5300000-0000-4000-8000-000000000001'
);

insert into public.categories (id, name, active, display_order) values
('e5400000-0000-4000-8000-000000000001', 'Unavailable Quantity Category', true, 0);

insert into public.products (
  id, category_id, name, unit_code, quantity_step, active, available
) values (
  'e5500000-0000-4000-8000-000000000001',
  'e5400000-0000-4000-8000-000000000001',
  'Historical KG Product', 'KG', 0.125, true, true
);

insert into public.order_items (
  id, order_id, product_id, product_name_snapshot, unit_code_snapshot,
  quantity_step_snapshot, requested_quantity, prepared_quantity, unavailable_quantity
) values
(
  'e5600000-0000-4000-8000-000000000001',
  'e5200000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000001',
  'Historical KG Product', 'KG', 0.125, 2.500, 0.375, 0.125
),
(
  'e5600000-0000-4000-8000-000000000002',
  'e5200000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000001',
  'Untouched Historical Item', 'KG', 0.125, 1.000, 0.000, 0.000
);

-- Future Product changes must not change historical OrderItem step or snapshot.
update public.products
set quantity_step = 0.500, name = 'Modern Name', available = false
where id = 'e5500000-0000-4000-8000-000000000001';

select has_function(
  'public', 'record_unavailable_quantity', array['uuid', 'numeric', 'text'],
  'record_unavailable_quantity(uuid,numeric,text) exists'
);
select ok(
  pg_catalog.to_regprocedure('public.record_unavailable_quantity(uuid,numeric,text)') is not null
  and coalesce(pg_catalog.has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure('public.record_unavailable_quantity(uuid,numeric,text)'),
    'EXECUTE'
  ), false),
  'authenticated has EXECUTE on the trusted RPC'
);
select ok(
  not coalesce(pg_catalog.has_function_privilege(
    'anon',
    pg_catalog.to_regprocedure('public.record_unavailable_quantity(uuid,numeric,text)'),
    'EXECUTE'
  ), true),
  'anon cannot execute the trusted RPC'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.order_items', 'UPDATE'),
  'authenticated cannot UPDATE OrderItems directly'
);
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.order_events', 'INSERT'),
  'authenticated cannot INSERT audit events directly'
);
select ok(
  (select p.prosecdef from pg_catalog.pg_proc p
   where p.oid = pg_catalog.to_regprocedure('public.record_unavailable_quantity(uuid,numeric,text)')),
  'unavailability RPC is SECURITY DEFINER'
);
select is(
  (select p.proowner::regrole::text from pg_catalog.pg_proc p
   where p.oid = pg_catalog.to_regprocedure('public.record_unavailable_quantity(uuid,numeric,text)')),
  'postgres', 'unavailability RPC owner is postgres'
);
-- PostgreSQL can serialize SET search_path = '' as search_path="".
select ok(
  (select coalesce(
    'search_path=' = any(p.proconfig)
    or 'search_path=""' = any(p.proconfig), false
  ) from pg_catalog.pg_proc p
   where p.oid = pg_catalog.to_regprocedure('public.record_unavailable_quantity(uuid,numeric,text)')),
  'SECURITY DEFINER has an empty search_path'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e5000000-0000-4000-8000-000000000002"}', true
);
select lives_ok(
  $$select public.start_order('e5200000-0000-4000-8000-000000000001')$$,
  'active KITCHEN starts preparation using M4-003'
);
select lives_ok(
  $$select public.record_unavailable_quantity('e5600000-0000-4000-8000-000000000001',0.375,'  Ingredient shortage  ')$$,
  'first shortage increment succeeds with required reason'
);
select lives_ok(
  $$select public.record_unavailable_quantity('e5600000-0000-4000-8000-000000000001',1.625,'Second batch unavailable')$$,
  'second increment resolves remaining historical quantity'
);
reset role;

select is(
  (select status::text from public.orders
   where id = 'e5200000-0000-4000-8000-000000000001'),
  'IN_PROGRESS', 'quantity resolution does not advance Order lifecycle automatically'
);
select is(
  (select requested_quantity from public.order_items
   where id = 'e5600000-0000-4000-8000-000000000001'),
  2.500::numeric, 'original requested amount is preserved'
);
select is(
  (select prepared_quantity from public.order_items
   where id = 'e5600000-0000-4000-8000-000000000001'),
  0.375::numeric, 'pre-existing prepared quantity is preserved'
);
select is(
  (select unavailable_quantity from public.order_items
   where id = 'e5600000-0000-4000-8000-000000000001'),
  2.125::numeric, 'two unavailable deltas are accumulated exactly'
);
select is(
  (select requested_quantity - prepared_quantity - unavailable_quantity
   from public.order_items where id = 'e5600000-0000-4000-8000-000000000001'),
  0::numeric, 'no unresolved quantity remains on affected item'
);
select is(
  (select quantity_step_snapshot from public.order_items
   where id = 'e5600000-0000-4000-8000-000000000001'),
  0.125::numeric, 'historical step is preserved after Product changes'
);
select is(
  (select product_name_snapshot from public.order_items
   where id = 'e5600000-0000-4000-8000-000000000001'),
  'Historical KG Product', 'original product snapshot is preserved'
);
select is(
  (select unavailable_quantity from public.order_items
   where id = 'e5600000-0000-4000-8000-000000000002'),
  0::numeric, 'another Item was not changed'
);
select is(
  (select count(*)::int from public.order_events
   where event_type = 'QUANTITY_UNAVAILABLE'
     and order_item_id = 'e5600000-0000-4000-8000-000000000001'),
  2, 'two successful deltas create exactly two audit events'
);
select is(
  (select count(*)::int from public.order_events
   where event_type = 'QUANTITY_UNAVAILABLE'
     and order_item_id = 'e5600000-0000-4000-8000-000000000002'),
  0, 'unmodified Item has no unavailability audit event'
);
select is(
  (select count(*)::int from public.order_events
   where event_type = 'QUANTITY_UNAVAILABLE'
     and order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and actor_user_id = 'e5000000-0000-4000-8000-000000000002'
     and order_id = 'e5200000-0000-4000-8000-000000000001'
     and occurred_at is not null),
  2, 'both events identify the correct actor, Order, Item and timestamp'
);
select is(
  (select e.reason from public.order_events e
   where e.event_type = 'QUANTITY_UNAVAILABLE'
     and e.order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and e.metadata = '{"quantity_delta":0.375}'::jsonb),
  'Ingredient shortage', 'reason is trimmed before audit persistence'
);
select is(
  (select e.reason from public.order_events e
   where e.event_type = 'QUANTITY_UNAVAILABLE'
     and e.order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and e.metadata = '{"quantity_delta":1.625}'::jsonb),
  'Second batch unavailable', 'each event preserves its own reason'
);
select is(
  (select e.previous_value from public.order_events e
   where e.event_type = 'QUANTITY_UNAVAILABLE'
     and e.order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and e.metadata = '{"quantity_delta":0.375}'::jsonb),
  '{"unavailable_quantity":0.125}'::jsonb, 'first event records previous total'
);
select is(
  (select e.new_value from public.order_events e
   where e.event_type = 'QUANTITY_UNAVAILABLE'
     and e.order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and e.metadata = '{"quantity_delta":0.375}'::jsonb),
  '{"unavailable_quantity":0.500}'::jsonb, 'first event records new total'
);
select is(
  (select e.previous_value from public.order_events e
   where e.event_type = 'QUANTITY_UNAVAILABLE'
     and e.order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and e.metadata = '{"quantity_delta":1.625}'::jsonb),
  '{"unavailable_quantity":0.500}'::jsonb, 'second event records previous total'
);
select is(
  (select e.new_value from public.order_events e
   where e.event_type = 'QUANTITY_UNAVAILABLE'
     and e.order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and e.metadata = '{"quantity_delta":1.625}'::jsonb),
  '{"unavailable_quantity":2.125}'::jsonb, 'second event records new total'
);
select is(
  (select e.occurred_at from public.order_events e
   where e.event_type = 'QUANTITY_UNAVAILABLE'
     and e.order_item_id = 'e5600000-0000-4000-8000-000000000001'
     and e.metadata = '{"quantity_delta":1.625}'::jsonb),
  (select i.updated_at from public.order_items i
   where i.id = 'e5600000-0000-4000-8000-000000000001'),
  'final event timestamp matches Item updated_at'
);

-- Existing MANAGER RLS is sufficient for auditing the shortage; no policy changes.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e5000000-0000-4000-8000-000000000003"}', true
);
select is(
  (select count(*)::int from public.order_events
   where event_type = 'QUANTITY_UNAVAILABLE'
     and order_item_id = 'e5600000-0000-4000-8000-000000000001'),
  2, 'MANAGER can read both shortage reasons through existing RLS'
);
reset role;

select * from finish();
rollback;
