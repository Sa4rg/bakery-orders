-- M5-004 RED -> GREEN. Trusted dispatch, COMPLETE/PARTIAL preservation, single audit.
begin;
select no_plan();

insert into auth.users(id,aud,role,email) values
('b4000000-0000-4000-8000-000000000001','authenticated','authenticated','m5004-customer@test.invalid'),
('b4000000-0000-4000-8000-000000000002','authenticated','authenticated','m5004-kitchen@test.invalid');
insert into public.profiles(id,display_name,role,active) values
('b4000000-0000-4000-8000-000000000001','M5 Dispatch Customer','CUSTOMER',true),
('b4000000-0000-4000-8000-000000000002','M5 Dispatch Kitchen','KITCHEN',true);
insert into public.businesses(id,name,active) values
('b4100000-0000-4000-8000-000000000001','M5 Dispatch Historical Business',false);
insert into public.categories(id,name,active,display_order) values
('b4400000-0000-4000-8000-000000000001','Dispatch Category',true,0);
insert into public.products(id,category_id,name,unit_code,quantity_step,active,available) values
('b4500000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000001','Dispatch Product','UNIT',1,true,true);

insert into public.orders(id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key,ready_at,ready_by_user_id) values
('b4200000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','READY','2030-11-05T10:00:00Z','b4300000-0000-4000-8000-000000000001','2026-11-03T13:00:00Z','b4000000-0000-4000-8000-000000000002'),
('b4200000-0000-4000-8000-000000000002','b4100000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','READY','2030-11-05T10:00:00Z','b4300000-0000-4000-8000-000000000002','2026-11-03T13:00:00Z','b4000000-0000-4000-8000-000000000002');
insert into public.order_items (
  id,order_id,product_id,product_name_snapshot,unit_code_snapshot,quantity_step_snapshot,
  requested_quantity,prepared_quantity,unavailable_quantity
) values
('b4600000-0000-4000-8000-000000000001','b4200000-0000-4000-8000-000000000001','b4500000-0000-4000-8000-000000000001','Complete','UNIT',1,3,3,0),
('b4600000-0000-4000-8000-000000000002','b4200000-0000-4000-8000-000000000002','b4500000-0000-4000-8000-000000000001','Partial','UNIT',1,3,1,2);

select has_function('public','dispatch_order',array['uuid'],'Trusted dispatch function exists');
select ok((select p.prosecdef from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.dispatch_order(uuid)')),
  'function is SECURITY DEFINER');
select is((select p.proowner::regrole::text from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.dispatch_order(uuid)')),'postgres',
  'dispatch function owner is postgres');
select ok((select coalesce('search_path=' = any(p.proconfig)
    or 'search_path=""' = any(p.proconfig),false) from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('public.dispatch_order(uuid)')),
  'fixed empty search_path');
select ok(pg_catalog.has_function_privilege('authenticated',
  pg_catalog.to_regprocedure('public.dispatch_order(uuid)'), 'EXECUTE'),
  'authenticated is allowed to call trusted function');
select ok(not pg_catalog.has_function_privilege('anon',
  pg_catalog.to_regprocedure('public.dispatch_order(uuid)'), 'EXECUTE'),
  'anon cannot execute');
select ok(not pg_catalog.has_table_privilege('authenticated','public.orders','UPDATE'),
  'authenticated cannot bypass dispatch through direct UPDATE');
select ok(not pg_catalog.has_table_privilege('authenticated','public.order_events','INSERT'),
  'authenticated cannot fabricate ORDER_DISPATCHED events');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"b4000000-0000-4000-8000-000000000002"}',true);
select lives_ok($$select public.dispatch_order('b4200000-0000-4000-8000-000000000001')$$,
  'dispatches READY COMPLETE once');
select lives_ok($$select public.dispatch_order('b4200000-0000-4000-8000-000000000002')$$,
  'dispatches READY PARTIAL once');
select throws_ok($$select public.dispatch_order('b4200000-0000-4000-8000-000000000001')$$,
  '22023',null,'second dispatch is rejected, never silently repeated');
reset role;

select is((select count(*)::int from public.orders
  where id in ('b4200000-0000-4000-8000-000000000001',
    'b4200000-0000-4000-8000-000000000002') and status = 'DISPATCHED'),2,
  'both complete and partial Orders are dispatched');
select is((select count(*)::int from public.order_events
  where order_id in ('b4200000-0000-4000-8000-000000000001',
    'b4200000-0000-4000-8000-000000000002') and event_type = 'ORDER_DISPATCHED'),2,
  'exactly one audit event per Order despite retry');
select ok((select dispatched_at is not null and dispatched_at = updated_at
    and dispatched_by_user_id = 'b4000000-0000-4000-8000-000000000002'::uuid
    from public.orders where id = 'b4200000-0000-4000-8000-000000000001'),
  'trusted actor and server timestamp saved on Order');
select ok((select e.occurred_at = o.dispatched_at and e.actor_user_id = o.dispatched_by_user_id
    and e.order_item_id is null and e.reason is null and e.metadata = '{}'::jsonb
    and e.previous_value = '{"status":"READY"}'::jsonb
    and e.new_value = '{"status":"DISPATCHED"}'::jsonb
    from public.orders o join public.order_events e on e.order_id = o.id
    where o.id = 'b4200000-0000-4000-8000-000000000002' and e.event_type='ORDER_DISPATCHED'),
  'audit records exact actor, timestamp and state transition');
select is((select prepared_quantity from public.order_items
  where id = 'b4600000-0000-4000-8000-000000000002'),1::numeric,
  'partial prepared quantity is preserved');
select is((select unavailable_quantity from public.order_items
  where id = 'b4600000-0000-4000-8000-000000000002'),2::numeric,
  'partial unavailable quantity is preserved');
select ok((select ready_at = '2026-11-03T13:00:00Z'::timestamptz
    and ready_by_user_id = 'b4000000-0000-4000-8000-000000000002'::uuid
    from public.orders where id = 'b4200000-0000-4000-8000-000000000001'),
  'prior READY attribution remains untouched');
select * from finish();
rollback;
