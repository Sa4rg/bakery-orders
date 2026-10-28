-- M4-005C: authorization, reason validation, lifecycle and rollback invariants.
-- Expected RED until public.record_unavailable_quantity(uuid,numeric,text) exists.
begin;
select no_plan();

insert into auth.users (id, aud, role, email) values
('f5000000-0000-4000-8000-000000000001','authenticated','authenticated','m4005-security-customer@example.test'),
('f5000000-0000-4000-8000-000000000002','authenticated','authenticated','m4005-security-manager@example.test'),
('f5000000-0000-4000-8000-000000000003','authenticated','authenticated','m4005-security-kitchen@example.test'),
('f5000000-0000-4000-8000-000000000004','authenticated','authenticated','m4005-security-inactive@example.test'),
('f5000000-0000-4000-8000-000000000005','authenticated','authenticated','m4005-security-no-profile@example.test');

insert into public.profiles (id, display_name, role, active) values
('f5000000-0000-4000-8000-000000000001','Unavailable Security Customer','CUSTOMER',true),
('f5000000-0000-4000-8000-000000000002','Unavailable Security Manager','MANAGER',true),
('f5000000-0000-4000-8000-000000000003','Unavailable Security Kitchen','KITCHEN',true),
('f5000000-0000-4000-8000-000000000004','Unavailable Security Inactive','KITCHEN',false);

insert into public.businesses (id,name,active) values
('f5100000-0000-4000-8000-000000000001','Unavailable Security Historical Business',false);

insert into public.business_memberships (id,user_id,business_id,active) values
('f5110000-0000-4000-8000-000000000001',
 'f5000000-0000-4000-8000-000000000001',
 'f5100000-0000-4000-8000-000000000001', true);

insert into public.orders (
  id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key
) values
('f5200000-0000-4000-8000-000000000001','f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','IN_PROGRESS','2026-10-30T10:00:00Z','f5300000-0000-4000-8000-000000000001'),
('f5200000-0000-4000-8000-000000000002','f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','RECEIVED','2026-10-30T10:00:00Z','f5300000-0000-4000-8000-000000000002'),
('f5200000-0000-4000-8000-000000000003','f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','READY','2026-10-30T10:00:00Z','f5300000-0000-4000-8000-000000000003'),
('f5200000-0000-4000-8000-000000000004','f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','RECEIVED','2026-10-30T10:00:00Z','f5300000-0000-4000-8000-000000000004');

-- CANCELLED has mandatory cancellation metadata under M3 constraints.
update public.orders
set status = 'CANCELLED',
    cancelled_at = '2026-10-26T12:00:00Z',
    cancelled_by_user_id = 'f5000000-0000-4000-8000-000000000002',
    cancellation_reason = 'Manager cancelled'
where id = 'f5200000-0000-4000-8000-000000000004';

insert into public.categories (id,name,active,display_order) values
('f5400000-0000-4000-8000-000000000001','Unavailable Security Category',true,0);
insert into public.products (
  id,category_id,name,unit_code,quantity_step,active,available
) values (
  'f5500000-0000-4000-8000-000000000001',
  'f5400000-0000-4000-8000-000000000001',
  'Unavailable Security Product','KG',0.500,true,true
);
insert into public.order_items (
  id,order_id,product_id,product_name_snapshot,unit_code_snapshot,
  quantity_step_snapshot,requested_quantity,prepared_quantity,unavailable_quantity
) values
('f5600000-0000-4000-8000-000000000001','f5200000-0000-4000-8000-000000000001','f5500000-0000-4000-8000-000000000001','Unavailable Security Product','KG',0.500,5.000,1.000,1.000),
('f5600000-0000-4000-8000-000000000002','f5200000-0000-4000-8000-000000000002','f5500000-0000-4000-8000-000000000001','Unavailable Security Product','KG',0.500,5.000,0.000,0.000),
('f5600000-0000-4000-8000-000000000003','f5200000-0000-4000-8000-000000000003','f5500000-0000-4000-8000-000000000001','Unavailable Security Product','KG',0.500,5.000,0.000,0.000),
('f5600000-0000-4000-8000-000000000004','f5200000-0000-4000-8000-000000000004','f5500000-0000-4000-8000-000000000001','Unavailable Security Product','KG',0.500,5.000,0.000,0.000),
('f5600000-0000-4000-8000-000000000005','f5200000-0000-4000-8000-000000000001','f5500000-0000-4000-8000-000000000001','Second Security Item','KG',0.500,2.000,0.000,0.000);

-- Authenticated but missing JWT identity.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,'Missing stock')$$,
  '42501',null,'missing identity cannot record unavailable quantities'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f5000000-0000-4000-8000-000000000001"}',true);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,'Missing stock')$$,
  '42501',null,'CUSTOMER cannot register unavailable quantities'
);
select throws_ok(
  $$update public.order_items set unavailable_quantity=3 where id='f5600000-0000-4000-8000-000000000001'$$,
  '42501',null,'CUSTOMER cannot update OrderItem directly'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f5000000-0000-4000-8000-000000000002"}',true);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,'Missing stock')$$,
  '42501',null,'MANAGER cannot use KITCHEN unavailability command'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f5000000-0000-4000-8000-000000000004"}',true);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,'Missing stock')$$,
  '42501',null,'inactive KITCHEN cannot register shortages'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f5000000-0000-4000-8000-000000000005"}',true);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,'Missing stock')$$,
  '42501',null,'KITCHEN JWT without Profile cannot register shortages'
);
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f5000000-0000-4000-8000-000000000003"}',true);
select throws_ok(
  $$select public.record_unavailable_quantity(null::uuid,0.500,'Missing stock')$$,
  '22023',null,'null OrderItem id is invalid'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5999999-9999-4999-8999-999999999999',0.500,'Missing stock')$$,
  '42501',null,'unknown Item does not disclose its existence'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',null::numeric,'Missing stock')$$,
  '22023',null,'null quantity is invalid'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0,'Missing stock')$$,
  '22023',null,'zero quantity is invalid'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',-0.500,'Missing stock')$$,
  '22023',null,'negative increment cannot undo shortages without a correction command'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.0005,'Missing stock')$$,
  '22023',null,'more than three decimal places rejected before any rounding'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.250,'Missing stock')$$,
  '22023',null,'increment violating historical 0.500 step rejected'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',3.500,'Missing stock')$$,
  '22023',null,'increment exceeding remaining 3.000 is rejected'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001','NaN'::numeric,'Missing stock')$$,
  '22023',null,'NaN is rejected'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001','Infinity'::numeric,'Missing stock')$$,
  '22023',null,'Infinity is rejected'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,null::text)$$,
  '22023',null,'null reason is rejected'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,'')$$,
  '22023',null,'empty reason is rejected'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,E' \t\r\n ')$$,
  '22023',null,'whitespace-only reason is rejected'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000002',0.500,'Missing stock')$$,
  '22023',null,'RECEIVED Order cannot register shortages'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000003',0.500,'Missing stock')$$,
  '22023',null,'READY Order cannot register shortages'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000004',0.500,'Missing stock')$$,
  '22023',null,'CANCELLED Order cannot register shortages'
);
reset role;

select is(
  (select unavailable_quantity from public.order_items
   where id='f5600000-0000-4000-8000-000000000001'),
  1.000::numeric,'all unsuccessful calls preserve the unavailable total'
);
select is(
  (select prepared_quantity from public.order_items
   where id='f5600000-0000-4000-8000-000000000001'),
  1.000::numeric,'all unsuccessful calls preserve the prepared total'
);
select is(
  (select count(*)::int from public.order_events
   where event_type='QUANTITY_UNAVAILABLE'
     and order_id in (
       'f5200000-0000-4000-8000-000000000001',
       'f5200000-0000-4000-8000-000000000002',
       'f5200000-0000-4000-8000-000000000003',
       'f5200000-0000-4000-8000-000000000004'
     )),
  0,'failed operations create no QUANTITY_UNAVAILABLE audit events'
);

-- The two quantity commands must coexist while honoring one remaining total.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f5000000-0000-4000-8000-000000000003"}',true);
select lives_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',2.500,'Supplier shortfall')$$,
  'unavailable increment consumes 2.500 of 3.000 remaining'
);
select lives_ok(
  $$select public.record_prepared_quantity('f5600000-0000-4000-8000-000000000001',0.500)$$,
  'prepared increment consumes last 0.500 remaining'
);
select throws_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000001',0.500,'Extra shortfall')$$,
  '22023',null,'no unavailability increment allowed after remaining reaches zero'
);
-- Repeating an accepted DELTA twice represents two distinct operations.
select lives_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000005',0.500,'First batch')$$,
  'first accepted shortage delta on separate Item'
);
select lives_ok(
  $$select public.record_unavailable_quantity('f5600000-0000-4000-8000-000000000005',0.500,'Second batch')$$,
  'second identical delta is a distinct accepted shortage operation'
);
reset role;

select is(
  (select unavailable_quantity from public.order_items
   where id='f5600000-0000-4000-8000-000000000001'),
  3.500::numeric,'unavailable total includes only successful shortage delta'
);
select is(
  (select prepared_quantity from public.order_items
   where id='f5600000-0000-4000-8000-000000000001'),
  1.500::numeric,'prepared total includes only successful preparation delta'
);
select is(
  (select requested_quantity - prepared_quantity - unavailable_quantity
   from public.order_items where id='f5600000-0000-4000-8000-000000000001'),
  0::numeric,'both commands share one authoritative remaining quantity'
);
select is(
  (select count(*)::int from public.order_events
   where event_type='QUANTITY_UNAVAILABLE'
     and order_item_id='f5600000-0000-4000-8000-000000000001'),
  1,'rejected shortage does not duplicate audit events'
);
select is(
  (select count(*)::int from public.order_events
   where event_type='QUANTITY_PREPARED'
     and order_item_id='f5600000-0000-4000-8000-000000000001'),
  1,'prepared command still writes its independent audit event'
);
select is(
  (select unavailable_quantity from public.order_items
   where id='f5600000-0000-4000-8000-000000000005'),
  1.000::numeric,'two accepted identical deltas accumulate on a separate Item'
);
select is(
  (select count(*)::int from public.order_events
   where event_type='QUANTITY_UNAVAILABLE'
     and order_item_id='f5600000-0000-4000-8000-000000000005'),
  2,'two accepted deltas have separate mandatory-reason audit events'
);
select is(
  (select count(*)::int from public.order_events
   where event_type='QUANTITY_UNAVAILABLE'
     and order_item_id='f5600000-0000-4000-8000-000000000005'
     and length(pg_catalog.btrim(reason, E' \t\r\n')) > 0),
  2,'both repeated shortage operations have nonempty persisted reasons'
);
select * from finish();
rollback;
