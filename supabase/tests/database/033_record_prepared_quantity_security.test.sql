-- M4-004C: negative actor, lifecycle, numeric and atomicity paths.
-- Expected RED until public.record_prepared_quantity(uuid,numeric) exists.
begin;
select no_plan();

insert into auth.users (id, aud, role, email) values
('d4000000-0000-4000-8000-000000000001','authenticated','authenticated','m4004-security-customer@example.test'),
('d4000000-0000-4000-8000-000000000002','authenticated','authenticated','m4004-security-manager@example.test'),
('d4000000-0000-4000-8000-000000000003','authenticated','authenticated','m4004-security-kitchen@example.test'),
('d4000000-0000-4000-8000-000000000004','authenticated','authenticated','m4004-security-inactive@example.test'),
('d4000000-0000-4000-8000-000000000005','authenticated','authenticated','m4004-security-noprofile@example.test');

insert into public.profiles (id, display_name, role, active) values
('d4000000-0000-4000-8000-000000000001','Prepared Security Customer','CUSTOMER',true),
('d4000000-0000-4000-8000-000000000002','Prepared Security Manager','MANAGER',true),
('d4000000-0000-4000-8000-000000000003','Prepared Security Kitchen','KITCHEN',true),
('d4000000-0000-4000-8000-000000000004','Prepared Security Inactive Kitchen','KITCHEN',false);

insert into public.businesses (id, name, active) values
('d4100000-0000-4000-8000-000000000001','Prepared Security Historic Business',false);

insert into public.business_memberships (id,user_id,business_id,active) values
('d4110000-0000-4000-8000-000000000001',
 'd4000000-0000-4000-8000-000000000001',
 'd4100000-0000-4000-8000-000000000001', true);

insert into public.orders (
  id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key
) values
('d4200000-0000-4000-8000-000000000001','d4100000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','IN_PROGRESS','2026-10-29T10:00:00Z','d4300000-0000-4000-8000-000000000001'),
('d4200000-0000-4000-8000-000000000002','d4100000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','RECEIVED','2026-10-29T10:00:00Z','d4300000-0000-4000-8000-000000000002'),
('d4200000-0000-4000-8000-000000000003','d4100000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','READY','2026-10-29T10:00:00Z','d4300000-0000-4000-8000-000000000003');

insert into public.categories (id,name,active,display_order) values
('d4400000-0000-4000-8000-000000000001','Prepared Security Category',true,0);
insert into public.products (
  id,category_id,name,unit_code,quantity_step,active,available
) values (
  'd4500000-0000-4000-8000-000000000001',
  'd4400000-0000-4000-8000-000000000001',
  'Prepared Security Product','KG',0.500,true,true
);
insert into public.order_items (
  id,order_id,product_id,product_name_snapshot,unit_code_snapshot,
  quantity_step_snapshot,requested_quantity,prepared_quantity,unavailable_quantity
) values
('d4600000-0000-4000-8000-000000000001','d4200000-0000-4000-8000-000000000001','d4500000-0000-4000-8000-000000000001','Prepared Security Product','KG',0.500,5.000,1.000,1.000),
('d4600000-0000-4000-8000-000000000002','d4200000-0000-4000-8000-000000000002','d4500000-0000-4000-8000-000000000001','Prepared Security Product','KG',0.500,5.000,0.000,0.000),
('d4600000-0000-4000-8000-000000000003','d4200000-0000-4000-8000-000000000003','d4500000-0000-4000-8000-000000000001','Prepared Security Product','KG',0.500,5.000,0.000,0.000);

-- No JWT subject.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.500)$$,
  '42501',null,'missing identity is denied'
);
reset role;

-- CUSTOMER may view their Order, but cannot mutate any prepared quantity.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d4000000-0000-4000-8000-000000000001"}',true);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.500)$$,
  '42501',null,'CUSTOMER cannot record preparation'
);
select throws_ok(
  $$update public.order_items set prepared_quantity=3 where id='d4600000-0000-4000-8000-000000000001'$$,
  '42501',null,'CUSTOMER has no direct item UPDATE permission'
);
reset role;

-- MANAGER is not an authorized actor for this KITCHEN-specific command.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d4000000-0000-4000-8000-000000000002"}',true);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.500)$$,
  '42501',null,'MANAGER cannot record KITCHEN quantities'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d4000000-0000-4000-8000-000000000004"}',true);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.500)$$,
  '42501',null,'inactive KITCHEN is rejected'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d4000000-0000-4000-8000-000000000005"}',true);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.500)$$,
  '42501',null,'JWT without Profile is rejected'
);
reset role;

-- Authenticated active KITCHEN: reject malformed quantities and lifecycle.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d4000000-0000-4000-8000-000000000003"}',true);
select throws_ok(
  $$select public.record_prepared_quantity(null::uuid,0.500)$$,
  '22023',null,'null OrderItem id is rejected'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4999999-9999-4999-8999-999999999999',0.500)$$,
  '42501',null,'unknown Item does not disclose existence'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',null::numeric)$$,
  '22023',null,'null increment is rejected'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0)$$,
  '22023',null,'zero increment is rejected'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',-0.500)$$,
  '22023',null,'negative decrement is prohibited without correction command'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.250)$$,
  '22023',null,'increment violating historic step is rejected'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.0005)$$,
  '22023',null,'fourth decimal place is rejected rather than rounded'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',3.500)$$,
  '22023',null,'increment cannot exceed requested minus prepared minus unavailable'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001','NaN'::numeric)$$,
  '22023',null,'NaN is rejected'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001','Infinity'::numeric)$$,
  '22023',null,'numeric Infinity is rejected'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000002',0.500)$$,
  '22023',null,'cannot record quantities while Order is RECEIVED'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000003',0.500)$$,
  '22023',null,'cannot record quantities after Order is READY'
);
reset role;

select is(
  (select prepared_quantity from public.order_items where id='d4600000-0000-4000-8000-000000000001'),
  1.000::numeric,'all failed commands preserve prepared quantity'
);
select is(
  (select unavailable_quantity from public.order_items where id='d4600000-0000-4000-8000-000000000001'),
  1.000::numeric,'all failed commands preserve unavailable quantity'
);
select is(
  (select count(*)::integer from public.order_events
   where event_type='QUANTITY_PREPARED' and order_id in (
    'd4200000-0000-4000-8000-000000000001',
    'd4200000-0000-4000-8000-000000000002',
    'd4200000-0000-4000-8000-000000000003'
  )),
  0,'failed attempts create no QUANTITY_PREPARED events'
);

-- A valid increment can consume exactly the unresolved quantity remaining
-- after previously prepared and unavailable amounts.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d4000000-0000-4000-8000-000000000003"}',true);
select lives_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',3.000)$$,
  'KITCHEN can resolve the remaining 3.000 after 1.000 prepared and 1.000 unavailable'
);
select throws_ok(
  $$select public.record_prepared_quantity('d4600000-0000-4000-8000-000000000001',0.500)$$,
  '22023',null,'no further preparation when remaining quantity is zero'
);
reset role;

select is(
  (select prepared_quantity from public.order_items where id='d4600000-0000-4000-8000-000000000001'),
  4.000::numeric,'successful increment advances cumulative prepared quantity exactly'
);
select is(
  (select unavailable_quantity from public.order_items where id='d4600000-0000-4000-8000-000000000001'),
  1.000::numeric,'successful increment does not overwrite unavailable quantity'
);
select is(
  (select count(*)::integer from public.order_events
   where event_type='QUANTITY_PREPARED'
     and order_item_id='d4600000-0000-4000-8000-000000000001'),
  1,'exactly one prepared audit event after rejected attempts'
);
select is(
  (select e.metadata from public.order_events as e
   where e.order_item_id='d4600000-0000-4000-8000-000000000001'
     and e.event_type='QUANTITY_PREPARED'),
  '{"quantity_delta":3.000}'::jsonb,'audit reflects exact accepted amount only'
);
select * from finish();
rollback;
