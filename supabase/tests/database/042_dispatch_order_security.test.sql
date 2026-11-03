-- M5-004: deny all non-KITCHEN actors, invalid states and non-existent IDs.
begin;
select no_plan();
insert into auth.users(id,aud,role,email) values
('b5000000-0000-4000-8000-000000000001','authenticated','authenticated','m5004-sec-customer@test.invalid'),
('b5000000-0000-4000-8000-000000000002','authenticated','authenticated','m5004-sec-manager@test.invalid'),
('b5000000-0000-4000-8000-000000000003','authenticated','authenticated','m5004-sec-kitchen@test.invalid'),
('b5000000-0000-4000-8000-000000000004','authenticated','authenticated','m5004-sec-inactive@test.invalid'),
('b5000000-0000-4000-8000-000000000005','authenticated','authenticated','m5004-sec-no-profile@test.invalid');
insert into public.profiles(id,display_name,role,active) values
('b5000000-0000-4000-8000-000000000001','Dispatch Security Customer','CUSTOMER',true),
('b5000000-0000-4000-8000-000000000002','Dispatch Security Manager','MANAGER',true),
('b5000000-0000-4000-8000-000000000003','Dispatch Security Kitchen','KITCHEN',true),
('b5000000-0000-4000-8000-000000000004','Dispatch Security Inactive','KITCHEN',false);
insert into public.businesses(id,name,active) values
('b5100000-0000-4000-8000-000000000001','Dispatch Security Business',true);
insert into public.orders(id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key) values
('b5200000-0000-4000-8000-000000000001','b5100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','RECEIVED','2030-11-05T10:00:00Z','b5300000-0000-4000-8000-000000000001'),
('b5200000-0000-4000-8000-000000000002','b5100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','IN_PROGRESS','2030-11-05T10:00:00Z','b5300000-0000-4000-8000-000000000002'),
('b5200000-0000-4000-8000-000000000003','b5100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','READY','2030-11-05T10:00:00Z','b5300000-0000-4000-8000-000000000003'),
('b5200000-0000-4000-8000-000000000004','b5100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','DISPATCHED','2030-11-05T10:00:00Z','b5300000-0000-4000-8000-000000000004'),
('b5200000-0000-4000-8000-000000000005','b5100000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','DELIVERED','2030-11-05T10:00:00Z','b5300000-0000-4000-8000-000000000005');

-- A CANCELLED fixture must satisfy the existing Order cancellation invariant.
insert into public.orders (
  id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key,
  cancelled_at,cancelled_by_user_id,cancellation_reason
) values (
  'b5200000-0000-4000-8000-000000000006',
  'b5100000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'CANCELLED',
  '2030-11-05T10:00:00Z',
  'b5300000-0000-4000-8000-000000000006',
  pg_catalog.clock_timestamp(),
  'b5000000-0000-4000-8000-000000000001',
  'Fixture cancellation for dispatch security tests'
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b5000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000003')$$,
  '42501',null,'CUSTOMER cannot dispatch READY');
reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b5000000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000003')$$,
  '42501',null,'MANAGER cannot dispatch READY');
reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b5000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000003')$$,
  '42501',null,'inactive KITCHEN denied');
reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b5000000-0000-4000-8000-000000000005"}',true);
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000003')$$,
  '42501',null,'missing Profile denied');
reset role;
set local role anon;
select pg_catalog.set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000003')$$,
  '42501',null,'anon cannot dispatch');
reset role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b5000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.dispatch_order(null::uuid)$$,
  '22023',null,'missing Order id denied');
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000099')$$,
  '42501',null,'nonexistent Order ID denied without enumeration');
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000001')$$,
  '22023',null,'RECEIVED cannot dispatch');
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000002')$$,
  '22023',null,'IN_PROGRESS cannot dispatch');
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000004')$$,
  '22023',null,'DISPATCHED cannot dispatch again');
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000005')$$,
  '22023',null,'DELIVERED cannot dispatch');
select throws_ok($$select public.dispatch_order('b5200000-0000-4000-8000-000000000006')$$,
  '22023',null,'CANCELLED cannot dispatch');
reset role;
select is((select count(*)::int from public.order_events
  where event_type = 'ORDER_DISPATCHED'
    and order_id in (select id from public.orders where business_id='b5100000-0000-4000-8000-000000000001')),
  0,'forbidden transitions never generate dispatch events');
select is((select count(*)::int from public.orders
  where business_id='b5100000-0000-4000-8000-000000000001' and dispatched_at is not null),
  0,'forbidden transitions never persist dispatch timestamp');
select * from finish();
rollback;
