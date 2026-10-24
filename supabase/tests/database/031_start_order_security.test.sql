-- M4-003: negative authorization, lifecycle and rollback paths.
begin;
select no_plan();

insert into auth.users (id, aud, role, email) values
('b3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4003-security-customer@example.test'),
('b3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm4003-security-manager@example.test'),
('b3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'm4003-security-kitchen@example.test'),
('b3000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'm4003-security-inactive-kitchen@example.test'),
('b3000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'm4003-security-no-profile@example.test');

insert into public.profiles (id, display_name, role, active) values
('b3000000-0000-4000-8000-000000000001', 'Start Security Customer', 'CUSTOMER', true),
('b3000000-0000-4000-8000-000000000002', 'Start Security Manager', 'MANAGER', true),
('b3000000-0000-4000-8000-000000000003', 'Start Security Kitchen', 'KITCHEN', true),
('b3000000-0000-4000-8000-000000000004', 'Start Security Inactive Kitchen', 'KITCHEN', false);

insert into public.businesses (id, name, active) values
('b3100000-0000-4000-8000-000000000001', 'Start Security Business', true);

insert into public.orders (
  id, business_id, created_by_user_id, status, requested_delivery_at, idempotency_key
) values
('b3200000-0000-4000-8000-000000000001', 'b3100000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'RECEIVED', '2026-10-28T12:00:00Z', 'b3300000-0000-4000-8000-000000000001'),
('b3200000-0000-4000-8000-000000000002', 'b3100000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'IN_PROGRESS', '2026-10-28T12:00:00Z', 'b3300000-0000-4000-8000-000000000002'),
('b3200000-0000-4000-8000-000000000003', 'b3100000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'READY', '2026-10-28T12:00:00Z', 'b3300000-0000-4000-8000-000000000003');

-- Invalid caller, no actor: SQL caller is authenticated but JWT has no subject.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'missing identity is denied'
);
reset role;

-- Active CUSTOMER is not authorized, even for an Order they created.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'CUSTOMER cannot start preparation'
);
reset role;

-- MANAGER has no KITCHEN command permissions.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000002"}', true);
select throws_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'MANAGER cannot use KITCHEN start command'
);
reset role;

-- A deactivated KITCHEN cannot act with an existing session.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000004"}', true);
select throws_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'inactive KITCHEN Profile is rejected'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000005"}', true);
select throws_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000001')$$,
  '42501', null, 'session without Profile is rejected'
);
reset role;

-- Active KITCHEN: reject missing and invalid IDs and non-RECEIVED states.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000003"}', true);
select throws_ok(
  $$select public.start_order(null::uuid)$$,
  '22023', null, 'null Order id rejected'
);
select throws_ok(
  $$select public.start_order('b3999999-9999-4999-8999-999999999999')$$,
  '42501', null, 'unknown Order ID does not disclose existence'
);
select throws_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000002')$$,
  '22023', null, 'cannot start already IN_PROGRESS Order'
);
select throws_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000003')$$,
  '22023', null, 'cannot start READY Order'
);
reset role;

select is(
  (select status::text from public.orders where id='b3200000-0000-4000-8000-000000000001'),
  'RECEIVED', 'unauthorized commands did not modify RECEIVED Order'
);
select is(
  (select count(*)::integer from public.order_events where event_type='PREPARATION_STARTED' and order_id in (
    'b3200000-0000-4000-8000-000000000001',
    'b3200000-0000-4000-8000-000000000002',
    'b3200000-0000-4000-8000-000000000003'
  )),
  0, 'failed commands created no PREPARATION_STARTED events'
);

-- Successful KITCHEN start prevents later CUSTOMER cancellation, preserving M3.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000003"}', true);
select lives_ok(
  $$select public.start_order('b3200000-0000-4000-8000-000000000001')$$,
  'active KITCHEN starts Order'
);
reset role;

-- customer membership allows cancellation lookup, but the changed lifecycle refuses it
insert into public.business_memberships (id,user_id,business_id,active) values (
  'b3400000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b3100000-0000-4000-8000-000000000001', true
);
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated","sub":"b3000000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$select public.cancel_customer_order('b3200000-0000-4000-8000-000000000001','Too late')$$,
  '22023', null, 'CUSTOMER cancellation rejected after preparation starts'
);
reset role;

select is(
  (select status::text from public.orders where id='b3200000-0000-4000-8000-000000000001'),
  'IN_PROGRESS', 'failed late cancellation preserves preparation state'
);
select is(
  (select count(*)::integer from public.order_events where order_id='b3200000-0000-4000-8000-000000000001' and event_type='PREPARATION_STARTED'),
  1, 'failed cancellation preserves exactly one preparation event'
);
select * from finish();
rollback;
