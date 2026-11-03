-- M5-005 RED: trusted CUSTOMER DISPATCHED -> DELIVERED, full/partial,
-- authoritative actor, timestamp and exactly one audit event.
begin;
select no_plan();

insert into auth.users (id,aud,role,email) values
('c4000000-0000-4000-8000-000000000001','authenticated','authenticated','m5005-customer-a@test.invalid'),
('c4000000-0000-4000-8000-000000000002','authenticated','authenticated','m5005-customer-same-business@test.invalid'),
('c4000000-0000-4000-8000-000000000003','authenticated','authenticated','m5005-kitchen@test.invalid');
insert into public.profiles(id,display_name,role,active) values
('c4000000-0000-4000-8000-000000000001','M5 Receipt Customer','CUSTOMER',true),
('c4000000-0000-4000-8000-000000000002','M5 Receipt Colleague','CUSTOMER',true),
('c4000000-0000-4000-8000-000000000003','M5 Receipt Kitchen','KITCHEN',true);
-- Historical orders remain receivable even if Business is deactivated,
-- provided that the receiving Customer still has an active membership.
insert into public.businesses(id,name,active) values
('c4100000-0000-4000-8000-000000000001','M5 Receipt Business',false);
insert into public.business_memberships(user_id,business_id,active) values
('c4000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001',true),
('c4000000-0000-4000-8000-000000000002','c4100000-0000-4000-8000-000000000001',true);
insert into public.categories(id,name,active,display_order) values
('c4400000-0000-4000-8000-000000000001','M5 Receipt Category',true,1);
insert into public.products(id,category_id,name,unit_code,quantity_step,active,available) values
('c4500000-0000-4000-8000-000000000001','c4400000-0000-4000-8000-000000000001','M5 Receipt Product','UNIT',1,true,true);
insert into public.orders (
  id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key,
  ready_at,ready_by_user_id,dispatched_at,dispatched_by_user_id
) values
('c4200000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','DISPATCHED','2030-11-08T10:00:00Z','c4300000-0000-4000-8000-000000000001','2026-11-03T12:00:00Z','c4000000-0000-4000-8000-000000000003','2026-11-03T13:00:00Z','c4000000-0000-4000-8000-000000000003'),
('c4200000-0000-4000-8000-000000000002','c4100000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','DISPATCHED','2030-11-08T10:00:00Z','c4300000-0000-4000-8000-000000000002','2026-11-03T12:00:00Z','c4000000-0000-4000-8000-000000000003','2026-11-03T13:00:00Z','c4000000-0000-4000-8000-000000000003');
insert into public.order_items(
  id,order_id,product_id,product_name_snapshot,unit_code_snapshot,quantity_step_snapshot,
  requested_quantity,prepared_quantity,unavailable_quantity
) values
('c4600000-0000-4000-8000-000000000001','c4200000-0000-4000-8000-000000000001','c4500000-0000-4000-8000-000000000001','Complete','UNIT',1,3,3,0),
('c4600000-0000-4000-8000-000000000002','c4200000-0000-4000-8000-000000000002','c4500000-0000-4000-8000-000000000001','Partial','UNIT',1,3,1,2);

select has_function('public','confirm_order_receipt',array['uuid'],'Receipt RPC exists');
select ok((select p.prosecdef from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.confirm_order_receipt(uuid)')),
  'receipt function is SECURITY DEFINER');
select is((select p.proowner::regrole::text from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.confirm_order_receipt(uuid)')),'postgres',
  'receipt function owner is postgres');
select ok((select coalesce('search_path=' = any(p.proconfig)
  or 'search_path=""' = any(p.proconfig),false) from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.confirm_order_receipt(uuid)')),
  'function uses fixed empty search_path');
select ok(pg_catalog.has_function_privilege('authenticated',
  pg_catalog.to_regprocedure('public.confirm_order_receipt(uuid)'), 'EXECUTE'),
  'authenticated may enter the trusted boundary');
select ok(not pg_catalog.has_function_privilege('anon',
  pg_catalog.to_regprocedure('public.confirm_order_receipt(uuid)'), 'EXECUTE'),
  'anonymous clients cannot execute');
select ok(not pg_catalog.has_table_privilege('authenticated','public.orders','UPDATE'),
  'authenticated cannot bypass receipt through direct UPDATE');
select ok(not pg_catalog.has_table_privilege('authenticated','public.order_events','INSERT'),
  'authenticated cannot fabricate delivery audit events');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c4000000-0000-4000-8000-000000000001"}',true);
select lives_ok($$select public.confirm_order_receipt('c4200000-0000-4000-8000-000000000001')$$,
  'creator may confirm receipt of COMPLETE Order');
select throws_ok($$select public.confirm_order_receipt('c4200000-0000-4000-8000-000000000001')$$,
  '22023',null,'second receipt confirmation rejects without extra event');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c4000000-0000-4000-8000-000000000002"}',true);
select lives_ok($$select public.confirm_order_receipt('c4200000-0000-4000-8000-000000000002')$$,
  'another authorized Customer of the receiving Business confirms PARTIAL Order');
reset role;

select is((select count(*)::int from public.orders
  where id in ('c4200000-0000-4000-8000-000000000001',
    'c4200000-0000-4000-8000-000000000002') and status='DELIVERED'),2,
  'both complete and partial Orders are DELIVERED');
select is((select count(*)::int from public.order_events
  where event_type='ORDER_DELIVERED' and order_id in (
    'c4200000-0000-4000-8000-000000000001',
    'c4200000-0000-4000-8000-000000000002')),2,
  'one and only one delivery audit event per Order');
select ok((select o.delivered_at is not null
    and o.delivered_at = o.updated_at
    and o.delivered_by_user_id = 'c4000000-0000-4000-8000-000000000002'::uuid
    from public.orders o where o.id='c4200000-0000-4000-8000-000000000002'),
  'server attributes receipt to authenticated colleague');
select ok((select o.dispatched_at = '2026-11-03T13:00:00Z'::timestamptz
    and o.dispatched_by_user_id = 'c4000000-0000-4000-8000-000000000003'::uuid
    from public.orders o where o.id='c4200000-0000-4000-8000-000000000001'),
  'prior trusted dispatch actor and timestamp unchanged');
select ok((select e.occurred_at = o.delivered_at
    and e.actor_user_id = o.delivered_by_user_id
    and e.order_item_id is null and e.reason is null and e.metadata = '{}'::jsonb
    and e.previous_value = '{"status":"DISPATCHED"}'::jsonb
    and e.new_value = '{"status":"DELIVERED"}'::jsonb
    from public.orders as o join public.order_events as e on e.order_id=o.id
    where o.id='c4200000-0000-4000-8000-000000000002'
      and e.event_type='ORDER_DELIVERED'),
  'delivery audit records the same server actor/time and state transition');
select is((select prepared_quantity from public.order_items
  where id='c4600000-0000-4000-8000-000000000002'),1::numeric,
  'partial prepared quantity is not modified');
select is((select unavailable_quantity from public.order_items
  where id='c4600000-0000-4000-8000-000000000002'),2::numeric,
  'partial unavailable quantity is not modified');
select * from finish();
rollback;
