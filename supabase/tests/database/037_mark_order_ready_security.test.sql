-- M4-008D/E/F: negative lifecycle, auth, unresolved and total unavailability.
-- The same locked SQL transition guards against retries and invalid actors.
begin;
select no_plan();

insert into auth.users (id,aud,role,email) values
('b8000000-0000-4000-8000-000000000001','authenticated','authenticated','m4008-security-customer@example.test'),
('b8000000-0000-4000-8000-000000000002','authenticated','authenticated','m4008-security-manager@example.test'),
('b8000000-0000-4000-8000-000000000003','authenticated','authenticated','m4008-security-kitchen@example.test'),
('b8000000-0000-4000-8000-000000000004','authenticated','authenticated','m4008-security-inactive@example.test'),
('b8000000-0000-4000-8000-000000000005','authenticated','authenticated','m4008-security-no-profile@example.test');

insert into public.profiles (id,display_name,role,active) values
('b8000000-0000-4000-8000-000000000001','READY Security Customer','CUSTOMER',true),
('b8000000-0000-4000-8000-000000000002','READY Security Manager','MANAGER',true),
('b8000000-0000-4000-8000-000000000003','READY Security Kitchen','KITCHEN',true),
('b8000000-0000-4000-8000-000000000004','READY Security Inactive Kitchen','KITCHEN',false);
insert into public.businesses (id,name,active) values
('b8100000-0000-4000-8000-000000000001','M4-008 Security Business',false);
insert into public.categories (id,name,active,display_order) values
('b8400000-0000-4000-8000-000000000001','M4-008 Security Category',true,0);
insert into public.products (id,category_id,name,unit_code,quantity_step,active,available) values
('b8500000-0000-4000-8000-000000000001','b8400000-0000-4000-8000-000000000001','M4-008 Security Product','KG',0.125,true,true);

-- #1 valid candidate; #2 unresolved; #3 fully unavailable; #4 RECEIVED;
-- #5 READY; #6 DISPATCHED; #7 DELIVERED; #8 CANCELLED; #9 itemless.
insert into public.orders (
 id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key
) values
('b8200000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','IN_PROGRESS','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000001'),
('b8200000-0000-4000-8000-000000000002','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','IN_PROGRESS','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000002'),
('b8200000-0000-4000-8000-000000000003','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','IN_PROGRESS','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000003'),
('b8200000-0000-4000-8000-000000000004','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','RECEIVED','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000004'),
('b8200000-0000-4000-8000-000000000005','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','READY','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000005'),
('b8200000-0000-4000-8000-000000000006','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','DISPATCHED','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000006'),
('b8200000-0000-4000-8000-000000000007','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','DELIVERED','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000007'),
('b8200000-0000-4000-8000-000000000008','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','RECEIVED','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000008'),
('b8200000-0000-4000-8000-000000000009','b8100000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','IN_PROGRESS','2026-11-05T10:00:00Z','b8300000-0000-4000-8000-000000000009');

update public.orders set
 status='CANCELLED',
 cancelled_at='2026-10-27T16:00:00Z',
 cancelled_by_user_id='b8000000-0000-4000-8000-000000000002',
 cancellation_reason='Cancelled for test'
where id='b8200000-0000-4000-8000-000000000008';

insert into public.order_items (
 id,order_id,product_id,product_name_snapshot,unit_code_snapshot,
 quantity_step_snapshot,requested_quantity,prepared_quantity,unavailable_quantity
) values
('b8600000-0000-4000-8000-000000000001','b8200000-0000-4000-8000-000000000001','b8500000-0000-4000-8000-000000000001','Candidate KG','KG',0.125,1.000,1.000,0.000),
('b8600000-0000-4000-8000-000000000002','b8200000-0000-4000-8000-000000000002','b8500000-0000-4000-8000-000000000001','Unresolved KG','KG',0.125,1.000,0.375,0.500),
('b8600000-0000-4000-8000-000000000003','b8200000-0000-4000-8000-000000000003','b8500000-0000-4000-8000-000000000001','Unavailable KG','KG',0.125,1.000,0.000,1.000),
('b8600000-0000-4000-8000-000000000004','b8200000-0000-4000-8000-000000000004','b8500000-0000-4000-8000-000000000001','Received KG','KG',0.125,1.000,0.000,0.000),
('b8600000-0000-4000-8000-000000000005','b8200000-0000-4000-8000-000000000005','b8500000-0000-4000-8000-000000000001','Already Ready KG','KG',0.125,1.000,1.000,0.000),
('b8600000-0000-4000-8000-000000000006','b8200000-0000-4000-8000-000000000006','b8500000-0000-4000-8000-000000000001','Dispatched KG','KG',0.125,1.000,1.000,0.000),
('b8600000-0000-4000-8000-000000000007','b8200000-0000-4000-8000-000000000007','b8500000-0000-4000-8000-000000000001','Delivered KG','KG',0.125,1.000,1.000,0.000),
('b8600000-0000-4000-8000-000000000008','b8200000-0000-4000-8000-000000000008','b8500000-0000-4000-8000-000000000001','Cancelled KG','KG',0.125,1.000,0.000,0.000);

-- JWT without a sub, followed by unauthorized authenticated roles.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000001')$$,
 '42501',null,'session without actor cannot mark an Order READY');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"b8000000-0000-4000-8000-000000000001"}',true);
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000001')$$,
 '42501',null,'CUSTOMER cannot mark READY even for own Order');
select throws_ok(
 $$update public.orders set status='READY' where id='b8200000-0000-4000-8000-000000000001'$$,
 '42501',null,'CUSTOMER cannot update the Order directly');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"b8000000-0000-4000-8000-000000000002"}',true);
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000001')$$,
 '42501',null,'MANAGER cannot mark READY through KITCHEN command');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"b8000000-0000-4000-8000-000000000004"}',true);
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000001')$$,
 '42501',null,'inactive KITCHEN cannot mark READY');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"b8000000-0000-4000-8000-000000000005"}',true);
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000001')$$,
 '42501',null,'authenticated user without Profile cannot mark READY');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"b8000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.mark_order_ready(null::uuid)$$,
 '22023',null,'null id rejected');
select throws_ok(
 $$select public.mark_order_ready('b8999999-9999-4999-8999-999999999999')$$,
 '42501',null,'unknown Order id does not disclose existence');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000002')$$,
 '22023',null,'UNRESOLVED Order rejected even though some quantity is prepared');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000003')$$,
 '22023',null,'fully UNAVAILABLE Order rejected even though remaining is zero');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000004')$$,
 '22023',null,'RECEIVED cannot skip production start');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000005')$$,
 '22023',null,'READY cannot be marked READY twice');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000006')$$,
 '22023',null,'DISPATCHED cannot return to READY');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000007')$$,
 '22023',null,'DELIVERED cannot return to READY');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000008')$$,
 '22023',null,'CANCELLED cannot return to READY');
select throws_ok(
 $$select public.mark_order_ready('b8200000-0000-4000-8000-000000000009')$$,
 '22023',null,'an itemless IN_PROGRESS Order cannot be marked READY');
reset role;

select is((select count(*)::int from public.orders where id in (
 'b8200000-0000-4000-8000-000000000001',
 'b8200000-0000-4000-8000-000000000002',
 'b8200000-0000-4000-8000-000000000003',
 'b8200000-0000-4000-8000-000000000009') and ready_at is not null),0,
 'rejected cases leave ready_at null');
select is((select count(*)::int from public.order_events
 where event_type='ORDER_READY' and order_id in (
 'b8200000-0000-4000-8000-000000000001',
 'b8200000-0000-4000-8000-000000000002',
 'b8200000-0000-4000-8000-000000000003',
 'b8200000-0000-4000-8000-000000000004',
 'b8200000-0000-4000-8000-000000000009')),0,
 'rejected commands create no ORDER_READY events');
select is((select status::text from public.orders
 where id='b8200000-0000-4000-8000-000000000001'),
 'IN_PROGRESS','unauthorized calls did not change a valid candidate');
select is((select status::text from public.orders
 where id='b8200000-0000-4000-8000-000000000002'),
 'IN_PROGRESS','UNRESOLVED remains IN_PROGRESS');
select is((select status::text from public.orders
 where id='b8200000-0000-4000-8000-000000000003'),
 'IN_PROGRESS','UNAVAILABLE remains IN_PROGRESS for M4-009 handling');
select is((select prepared_quantity from public.order_items
 where id='b8600000-0000-4000-8000-000000000002'),
 0.375::numeric,'failed READY leaves prepared quantity unchanged');
select is((select unavailable_quantity from public.order_items
 where id='b8600000-0000-4000-8000-000000000003'),
 1.000::numeric,'failed READY leaves unavailable quantity unchanged');
select * from finish();
rollback;
