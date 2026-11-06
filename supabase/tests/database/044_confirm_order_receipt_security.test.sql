-- M5-005 RED: all roles, cross-Business, inactive membership, invalid lifecycle.
begin;
select no_plan();
insert into auth.users(id,aud,role,email) values
('c5000000-0000-4000-8000-000000000001','authenticated','authenticated','m5005-sec-customer-a@test.invalid'),
('c5000000-0000-4000-8000-000000000002','authenticated','authenticated','m5005-sec-customer-b@test.invalid'),
('c5000000-0000-4000-8000-000000000003','authenticated','authenticated','m5005-sec-kitchen@test.invalid'),
('c5000000-0000-4000-8000-000000000004','authenticated','authenticated','m5005-sec-manager@test.invalid'),
('c5000000-0000-4000-8000-000000000005','authenticated','authenticated','m5005-sec-inactive@test.invalid'),
('c5000000-0000-4000-8000-000000000006','authenticated','authenticated','m5005-sec-no-membership@test.invalid'),
('c5000000-0000-4000-8000-000000000007','authenticated','authenticated','m5005-sec-inactive-membership@test.invalid'),
('c5000000-0000-4000-8000-000000000008','authenticated','authenticated','m5005-sec-no-profile@test.invalid');
insert into public.profiles(id,display_name,role,active) values
('c5000000-0000-4000-8000-000000000001','M5 Security Customer A','CUSTOMER',true),
('c5000000-0000-4000-8000-000000000002','M5 Security Customer B','CUSTOMER',true),
('c5000000-0000-4000-8000-000000000003','M5 Security Kitchen','KITCHEN',true),
('c5000000-0000-4000-8000-000000000004','M5 Security Manager','MANAGER',true),
('c5000000-0000-4000-8000-000000000005','M5 Security Inactive Customer','CUSTOMER',false),
('c5000000-0000-4000-8000-000000000006','M5 Security No Membership','CUSTOMER',true),
('c5000000-0000-4000-8000-000000000007','M5 Security Inactive Membership','CUSTOMER',true);
insert into public.businesses(id,name,active) values
('c5100000-0000-4000-8000-000000000001','M5 Security Business A',true),
('c5100000-0000-4000-8000-000000000002','M5 Security Business B',true);
insert into public.business_memberships(user_id,business_id,active) values
('c5000000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000001',true),
('c5000000-0000-4000-8000-000000000002','c5100000-0000-4000-8000-000000000002',true),
('c5000000-0000-4000-8000-000000000005','c5100000-0000-4000-8000-000000000001',true),
('c5000000-0000-4000-8000-000000000007','c5100000-0000-4000-8000-000000000001',false);
insert into public.orders(
  id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key,
  dispatched_at,dispatched_by_user_id
) values
('c5200000-0000-4000-8000-000000000001','c5100000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','RECEIVED','2030-11-08T10:00:00Z','c5300000-0000-4000-8000-000000000001',null,null),
('c5200000-0000-4000-8000-000000000002','c5100000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','IN_PROGRESS','2030-11-08T10:00:00Z','c5300000-0000-4000-8000-000000000002',null,null),
('c5200000-0000-4000-8000-000000000003','c5100000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','READY','2030-11-08T10:00:00Z','c5300000-0000-4000-8000-000000000003',null,null),
('c5200000-0000-4000-8000-000000000004','c5100000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','DISPATCHED','2030-11-08T10:00:00Z','c5300000-0000-4000-8000-000000000004','2026-11-03T12:00:00Z','c5000000-0000-4000-8000-000000000003'),
('c5200000-0000-4000-8000-000000000005','c5100000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','DELIVERED','2030-11-08T10:00:00Z','c5300000-0000-4000-8000-000000000005','2026-11-03T12:00:00Z','c5000000-0000-4000-8000-000000000003'),
('c5200000-0000-4000-8000-000000000007','c5100000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000002','DISPATCHED','2030-11-08T10:00:00Z','c5300000-0000-4000-8000-000000000007','2026-11-03T12:00:00Z','c5000000-0000-4000-8000-000000000003');
insert into public.orders(
  id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key,
  cancelled_at,cancelled_by_user_id,cancellation_reason
) values
('c5200000-0000-4000-8000-000000000006','c5100000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','CANCELLED','2030-11-08T10:00:00Z','c5300000-0000-4000-8000-000000000006',
  '2026-11-03T13:00:00Z','c5000000-0000-4000-8000-000000000001','Fixture cancelled before receipt');

-- Foreign and unknown identifiers both use 42501 (no enumeration).
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.confirm_order_receipt(null::uuid)$$,
  '22023',null,'NULL Order id is rejected');
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000099')$$,
  '42501',null,'unknown Order never reveals membership');
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000007')$$,
  '42501',null,'foreign Business Order indistinguishable from unknown');
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000001')$$,
  '22023',null,'RECEIVED cannot be delivered');
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000002')$$,
  '22023',null,'IN_PROGRESS cannot be delivered');
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000003')$$,
  '22023',null,'READY cannot be delivered without dispatch');
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000005')$$,
  '22023',null,'DELIVERED cannot be delivered twice');
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000006')$$,
  '22023',null,'CANCELLED cannot be delivered');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'other Business CUSTOMER denied');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'KITCHEN cannot confirm receipt');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'MANAGER cannot confirm receipt');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000005"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'inactive profile denied');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000006"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'CUSTOMER without membership denied');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000007"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'inactive membership denied');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000008"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'missing profile denied');
reset role;

set local role anon;
select pg_catalog.set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'anonymous client cannot execute receipt RPC');
reset role;

-- Membership revocation is enforced on every attempt, not cached from UI.
update public.business_memberships set active = false
  where user_id='c5000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c5000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.confirm_order_receipt('c5200000-0000-4000-8000-000000000004')$$,
  '42501',null,'revoked membership blocks confirmation');
reset role;

select is((select count(*)::int from public.order_events
  where event_type='ORDER_DELIVERED' and order_id in (
    select id from public.orders where business_id='c5100000-0000-4000-8000-000000000001')),
  0,'all rejected operations generate zero delivery audit events');
select is((select count(*)::int from public.orders
  where business_id='c5100000-0000-4000-8000-000000000001'
    and delivered_at is not null),0,
  'all rejected operations preserve delivery metadata');
select * from finish();
rollback;
