-- M4-003: successful, atomic preparation start contract.
-- A failing function lookup/command is expected during RED.
begin;
select no_plan();

insert into auth.users (id, aud, role, email) values
  ('a3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4003-customer@example.test'),
  ('a3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm4003-kitchen@example.test');

insert into public.profiles (id, display_name, role, active) values
  ('a3000000-0000-4000-8000-000000000001', 'Start Order Customer', 'CUSTOMER', true),
  ('a3000000-0000-4000-8000-000000000002', 'Start Order Kitchen', 'KITCHEN', true);

insert into public.businesses (id, name, active) values
  ('a3100000-0000-4000-8000-000000000001', 'Start Order Business', false);

-- No BusinessMembership for KITCHEN: operational authorization is bakery-wide.
insert into public.orders (
  id, business_id, created_by_user_id, status, requested_delivery_at, idempotency_key
) values (
  'a3200000-0000-4000-8000-000000000001',
  'a3100000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'RECEIVED',
  '2026-10-28T12:00:00Z',
  'a3300000-0000-4000-8000-000000000001'
);

insert into public.categories (id, name, active, display_order) values
  ('a3400000-0000-4000-8000-000000000001', 'Start Order Category', true, 0);
insert into public.products (
  id, category_id, name, unit_code, quantity_step, active, available
) values (
  'a3500000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000001',
  'Start Order Product', 'EACH', 1.000, true, true
);
insert into public.order_items (
  id, order_id, product_id, product_name_snapshot, unit_code_snapshot,
  quantity_step_snapshot, requested_quantity
) values (
  'a3600000-0000-4000-8000-000000000001',
  'a3200000-0000-4000-8000-000000000001',
  'a3500000-0000-4000-8000-000000000001',
  'Start Order Product', 'EACH', 1.000, 5.000
);

select has_function(
  'public', 'start_order', array['uuid'],
  'start_order(uuid) exists'
);
select ok(
  has_function_privilege('authenticated', 'public.start_order(uuid)', 'EXECUTE'),
  'authenticated may invoke the trusted command'
);
select ok(
  not has_function_privilege('anon', 'public.start_order(uuid)', 'EXECUTE'),
  'anon cannot invoke the trusted command'
);
select ok(
  not has_table_privilege('authenticated', 'public.orders', 'UPDATE'),
  'direct browser Order writes remain forbidden'
);
select ok(
  not has_table_privilege('authenticated', 'public.order_events', 'INSERT'),
  'direct browser audit writes remain forbidden'
);
select ok(
  (select prosecdef from pg_catalog.pg_proc
   where oid = 'public.start_order(uuid)'::regprocedure),
  'command executes as SECURITY DEFINER'
);
select is(
  (select proowner::regrole::text from pg_catalog.pg_proc
   where oid = 'public.start_order(uuid)'::regprocedure),
  'postgres',
  'function owner is controlled'
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3000000-0000-4000-8000-000000000002"}',
  true
);
select lives_ok(
  $$select public.start_order('a3200000-0000-4000-8000-000000000001')$$,
  'active KITCHEN starts RECEIVED Order without a BusinessMembership'
);
select throws_ok(
  $$select public.start_order('a3200000-0000-4000-8000-000000000001')$$,
  '22023', null,
  'second start is rejected, not silently idempotent'
);
reset role;

select is(
  (select status::text from public.orders
   where id = 'a3200000-0000-4000-8000-000000000001'),
  'IN_PROGRESS', 'Order status becomes IN_PROGRESS'
);
select is(
  (select started_by_user_id from public.orders
   where id = 'a3200000-0000-4000-8000-000000000001'),
  'a3000000-0000-4000-8000-000000000002'::uuid,
  'started_by_user_id comes from authenticated actor'
);
select ok(
  (select started_at is not null and started_at = updated_at
   from public.orders where id = 'a3200000-0000-4000-8000-000000000001'),
  'started_at and updated_at are trusted and consistent'
);
select is(
  (select count(*)::integer from public.order_events
   where order_id = 'a3200000-0000-4000-8000-000000000001'
     and event_type = 'PREPARATION_STARTED'),
  1, 'exactly one audit event after double-start attempt'
);
select ok(
  (select e.actor_user_id = o.started_by_user_id
      and e.occurred_at = o.started_at
      and e.order_item_id is null and e.reason is null
   from public.order_events as e
   join public.orders as o on o.id = e.order_id
   where e.order_id = 'a3200000-0000-4000-8000-000000000001'
     and e.event_type = 'PREPARATION_STARTED'),
  'event actor and timestamp match trusted Order metadata'
);
select is(
  (select previous_value from public.order_events
   where order_id = 'a3200000-0000-4000-8000-000000000001'
     and event_type = 'PREPARATION_STARTED'),
  '{"status":"RECEIVED"}'::jsonb,
  'audit preserves previous status'
);
select is(
  (select new_value from public.order_events
   where order_id = 'a3200000-0000-4000-8000-000000000001'
     and event_type = 'PREPARATION_STARTED'),
  '{"status":"IN_PROGRESS"}'::jsonb,
  'audit preserves new status'
);
select is(
  (select requested_quantity from public.order_items
   where id = 'a3600000-0000-4000-8000-000000000001'),
  5.000::numeric,
  'start does not modify requested quantity'
);
select is(
  (select prepared_quantity + unavailable_quantity from public.order_items
   where id = 'a3600000-0000-4000-8000-000000000001'),
  0.000::numeric,
  'start does not modify item production quantities'
);
select * from finish();
rollback;
