-- M5-006: legacy commands must respect the terminal delivery lifecycle.
-- Complements M5-004/005 status matrices rather than repeating those RPCs.
begin;
select plan(16);

insert into auth.users(id,aud,role,email) values
('d6000000-0000-4000-8000-000000000001','authenticated','authenticated','m5006-terminal-customer@test.invalid'),
('d6000000-0000-4000-8000-000000000002','authenticated','authenticated','m5006-terminal-kitchen@test.invalid');
insert into public.profiles(id,display_name,role,active) values
('d6000000-0000-4000-8000-000000000001','M5-006 Terminal Customer','CUSTOMER',true),
('d6000000-0000-4000-8000-000000000002','M5-006 Terminal Kitchen','KITCHEN',true);
insert into public.businesses(id,name,active) values
('d6100000-0000-4000-8000-000000000001','M5-006 Terminal Business',true);
insert into public.business_memberships(user_id,business_id,active) values
('d6000000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001',true);
insert into public.categories(id,name,active,display_order) values
('d6400000-0000-4000-8000-000000000001','M5-006 Terminal Category',true,0);
insert into public.products(id,category_id,name,unit_code,quantity_step,active,available) values
('d6500000-0000-4000-8000-000000000001','d6400000-0000-4000-8000-000000000001',
 'M5-006 Terminal Product','UNIT',1,true,true);

insert into public.orders (
  id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key,
  ready_at,ready_by_user_id,dispatched_at,dispatched_by_user_id,
  delivered_at,delivered_by_user_id
) values
('d6200000-0000-4000-8000-000000000001','d6100000-0000-4000-8000-000000000001',
 'd6000000-0000-4000-8000-000000000001','DISPATCHED','2030-11-08T10:00:00Z',
 'd6300000-0000-4000-8000-000000000001','2026-11-03T12:00:00Z',
 'd6000000-0000-4000-8000-000000000002','2026-11-03T13:00:00Z',
 'd6000000-0000-4000-8000-000000000002',null,null),
('d6200000-0000-4000-8000-000000000002','d6100000-0000-4000-8000-000000000001',
 'd6000000-0000-4000-8000-000000000001','DELIVERED','2030-11-08T10:00:00Z',
 'd6300000-0000-4000-8000-000000000002','2026-11-03T12:00:00Z',
 'd6000000-0000-4000-8000-000000000002','2026-11-03T13:00:00Z',
 'd6000000-0000-4000-8000-000000000002','2026-11-03T14:00:00Z',
 'd6000000-0000-4000-8000-000000000001');
insert into public.order_items(
  id,order_id,product_id,product_name_snapshot,unit_code_snapshot,quantity_step_snapshot,
  requested_quantity,prepared_quantity,unavailable_quantity
) values
('d6600000-0000-4000-8000-000000000001','d6200000-0000-4000-8000-000000000001',
 'd6500000-0000-4000-8000-000000000001','M5-006 Dispatched','UNIT',1,3,1,2),
('d6600000-0000-4000-8000-000000000002','d6200000-0000-4000-8000-000000000002',
 'd6500000-0000-4000-8000-000000000001','M5-006 Delivered','UNIT',1,3,1,2);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d6000000-0000-4000-8000-000000000002"}',true);
select throws_ok($$select public.start_order('d6200000-0000-4000-8000-000000000001')$$,
  '22023',null,'KITCHEN cannot restart DISPATCHED');
select throws_ok($$select public.start_order('d6200000-0000-4000-8000-000000000002')$$,
  '22023',null,'KITCHEN cannot restart DELIVERED');
select throws_ok($$select public.record_prepared_quantity('d6600000-0000-4000-8000-000000000001',1)$$,
  '22023',null,'KITCHEN cannot add prepared amount to DISPATCHED');
select throws_ok($$select public.record_prepared_quantity('d6600000-0000-4000-8000-000000000002',1)$$,
  '22023',null,'KITCHEN cannot add prepared amount to DELIVERED');
select throws_ok($$select public.record_unavailable_quantity('d6600000-0000-4000-8000-000000000001',1,'Too late')$$,
  '22023',null,'KITCHEN cannot add unavailable amount to DISPATCHED');
select throws_ok($$select public.record_unavailable_quantity('d6600000-0000-4000-8000-000000000002',1,'Too late')$$,
  '22023',null,'KITCHEN cannot add unavailable amount to DELIVERED');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d6000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.cancel_customer_order('d6200000-0000-4000-8000-000000000001','Too late')$$,
  '22023',null,'CUSTOMER cannot cancel DISPATCHED');
select throws_ok($$select public.cancel_customer_order('d6200000-0000-4000-8000-000000000002','Too late')$$,
  '22023',null,'CUSTOMER cannot cancel DELIVERED');
reset role;

select ok((select status='DISPATCHED' from public.orders
  where id='d6200000-0000-4000-8000-000000000001'),
  'DISPATCHED state preserved');
select ok((select status='DELIVERED' from public.orders
  where id='d6200000-0000-4000-8000-000000000002'),
  'DELIVERED state preserved');
select ok((select requested_quantity=3 and prepared_quantity=1 and unavailable_quantity=2
  from public.order_items where id='d6600000-0000-4000-8000-000000000001'),
  'DISPATCHED quantities remain unchanged');
select ok((select requested_quantity=3 and prepared_quantity=1 and unavailable_quantity=2
  from public.order_items where id='d6600000-0000-4000-8000-000000000002'),
  'DELIVERED quantities remain unchanged');
select is((select count(*)::int from public.order_events
  where order_id in ('d6200000-0000-4000-8000-000000000001',
    'd6200000-0000-4000-8000-000000000002')),0,
  'all eight rejected operations create zero audit events');
select ok((select dispatched_at='2026-11-03T13:00:00Z'::timestamptz
  from public.orders where id='d6200000-0000-4000-8000-000000000001'),
  'DISPATCHED server metadata unchanged');
select ok((select delivered_at='2026-11-03T14:00:00Z'::timestamptz
  from public.orders where id='d6200000-0000-4000-8000-000000000002'),
  'DELIVERED server metadata unchanged');
select ok((select cancelled_at is null and cancelled_by_user_id is null
  from public.orders where id='d6200000-0000-4000-8000-000000000002'),
  'failed cancellations do not create cancellation metadata');

select * from finish();
rollback;
