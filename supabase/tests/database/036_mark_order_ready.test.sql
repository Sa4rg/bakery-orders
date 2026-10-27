-- M4-008A/B/C: COMPLETE and PARTIAL success, trusted metadata, no item edits.
-- Expected RED until public.mark_order_ready(uuid) exists.
begin;
select no_plan();

insert into auth.users (id,aud,role,email) values
('a8000000-0000-4000-8000-000000000001','authenticated','authenticated','m4008-success-customer@example.test'),
('a8000000-0000-4000-8000-000000000002','authenticated','authenticated','m4008-success-kitchen@example.test');

insert into public.profiles (id,display_name,role,active) values
('a8000000-0000-4000-8000-000000000001','M4-008 Customer','CUSTOMER',true),
('a8000000-0000-4000-8000-000000000002','M4-008 Kitchen','KITCHEN',true);

-- KITCHEN authorization must not require Customer Business membership.
insert into public.businesses (id,name,active) values
('a8100000-0000-4000-8000-000000000001','M4-008 Historical Business',false);
insert into public.categories (id,name,active,display_order) values
('a8400000-0000-4000-8000-000000000001','M4-008 Category',true,0);
insert into public.products (id,category_id,name,unit_code,quantity_step,active,available) values
('a8500000-0000-4000-8000-000000000001','a8400000-0000-4000-8000-000000000001','M4-008 Product','KG',0.125,true,true);

insert into public.orders (id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key) values
('a8200000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','RECEIVED','2026-11-05T10:00:00Z','a8300000-0000-4000-8000-000000000001'),
('a8200000-0000-4000-8000-000000000002','a8100000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','RECEIVED','2026-11-05T10:00:00Z','a8300000-0000-4000-8000-000000000002');

insert into public.order_items (
 id,order_id,product_id,product_name_snapshot,unit_code_snapshot,
 quantity_step_snapshot,requested_quantity
) values
('a8600000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001','a8500000-0000-4000-8000-000000000001','Complete KG A','KG',0.125,1.000),
('a8600000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000001','a8500000-0000-4000-8000-000000000001','Complete KG B','KG',0.125,0.500),
('a8600000-0000-4000-8000-000000000003','a8200000-0000-4000-8000-000000000002','a8500000-0000-4000-8000-000000000001','Partial KG A','KG',0.125,1.000),
('a8600000-0000-4000-8000-000000000004','a8200000-0000-4000-8000-000000000002','a8500000-0000-4000-8000-000000000001','Partial KG B','KG',0.125,0.500);

select has_function('public','mark_order_ready',array['uuid'], 'READY trusted RPC exists');
select ok(
  pg_catalog.to_regprocedure('public.mark_order_ready(uuid)') is not null
  and coalesce(pg_catalog.has_function_privilege('authenticated',
    pg_catalog.to_regprocedure('public.mark_order_ready(uuid)'), 'EXECUTE'), false),
  'authenticated role may invoke trusted RPC'
);
select ok(
  not coalesce(pg_catalog.has_function_privilege('anon',
    pg_catalog.to_regprocedure('public.mark_order_ready(uuid)'), 'EXECUTE'), true),
  'anon may not invoke READY RPC'
);
select ok(
  (select p.prosecdef from pg_catalog.pg_proc p
   where p.oid=pg_catalog.to_regprocedure('public.mark_order_ready(uuid)')),
  'READY function is SECURITY DEFINER'
);
select is(
  (select p.proowner::regrole::text from pg_catalog.pg_proc p
   where p.oid=pg_catalog.to_regprocedure('public.mark_order_ready(uuid)')),
  'postgres', 'trusted owner is postgres'
);
select ok(
  (select coalesce(
      'search_path='=any(p.proconfig) or 'search_path=""'=any(p.proconfig), false)
   from pg_catalog.pg_proc p
   where p.oid=pg_catalog.to_regprocedure('public.mark_order_ready(uuid)')),
  'READY command uses an empty search_path'
);
select ok(not pg_catalog.has_table_privilege('authenticated','public.orders','UPDATE'),
 'authenticated cannot directly update Orders');
select ok(not pg_catalog.has_table_privilege('authenticated','public.order_events','INSERT'),
 'authenticated cannot directly fabricate audit events');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a8000000-0000-4000-8000-000000000002"}',true);
select lives_ok(
 $$select public.start_order('a8200000-0000-4000-8000-000000000001')$$,
 'KITCHEN starts COMPLETE case'
);
select lives_ok(
 $$select public.start_order('a8200000-0000-4000-8000-000000000002')$$,
 'KITCHEN starts PARTIAL case'
);
select lives_ok(
 $$select public.record_prepared_quantity('a8600000-0000-4000-8000-000000000001',1.000)$$,
 'COMPLETE first item fully prepared'
);
select lives_ok(
 $$select public.record_prepared_quantity('a8600000-0000-4000-8000-000000000002',0.500)$$,
 'COMPLETE second item fully prepared'
);
select lives_ok(
 $$select public.record_prepared_quantity('a8600000-0000-4000-8000-000000000003',0.375)$$,
 'PARTIAL first item partly prepared'
);
select lives_ok(
 $$select public.record_unavailable_quantity('a8600000-0000-4000-8000-000000000003',0.625,'Ingredient shortage')$$,
 'PARTIAL first item remainder unavailable'
);
select lives_ok(
 $$select public.record_unavailable_quantity('a8600000-0000-4000-8000-000000000004',0.500,'No stock')$$,
 'PARTIAL second item unavailable'
);
select lives_ok(
 $$select public.mark_order_ready('a8200000-0000-4000-8000-000000000001')$$,
 'KITCHEN marks COMPLETE Order READY'
);
select lives_ok(
 $$select public.mark_order_ready('a8200000-0000-4000-8000-000000000002')$$,
 'KITCHEN marks PARTIAL Order READY'
);
select throws_ok(
 $$select public.mark_order_ready('a8200000-0000-4000-8000-000000000001')$$,
 '22023', null, 'second READY call is not silently idempotent'
);
reset role;

select is((select status::text from public.orders where id='a8200000-0000-4000-8000-000000000001'),
  'READY','COMPLETE Order transitions to READY');
select is((select status::text from public.orders where id='a8200000-0000-4000-8000-000000000002'),
  'READY','PARTIAL Order transitions to READY');
select ok((select ready_at is not null and ready_at=updated_at and
  ready_by_user_id='a8000000-0000-4000-8000-000000000002'::uuid
  from public.orders where id='a8200000-0000-4000-8000-000000000001'),
  'COMPLETE trusted actor and timestamp are persisted');
select ok((select ready_at is not null and ready_at=updated_at and
  ready_by_user_id='a8000000-0000-4000-8000-000000000002'::uuid
  from public.orders where id='a8200000-0000-4000-8000-000000000002'),
  'PARTIAL trusted actor and timestamp are persisted');
select is((select count(*)::int from public.order_events
  where event_type='ORDER_READY' and order_id in (
    'a8200000-0000-4000-8000-000000000001',
    'a8200000-0000-4000-8000-000000000002')),2,
  'exactly two READY events, no duplicate from repeated command');
select is((select metadata->>'fulfillment_condition' from public.order_events
  where order_id='a8200000-0000-4000-8000-000000000001' and event_type='ORDER_READY'),
  'COMPLETE','COMPLETE audit classification derives from server totals');
select is((select metadata->>'fulfillment_condition' from public.order_events
  where order_id='a8200000-0000-4000-8000-000000000002' and event_type='ORDER_READY'),
  'PARTIAL','PARTIAL audit classification derives from server totals');
select is((select metadata->>'prepared_quantity' from public.order_events
  where order_id='a8200000-0000-4000-8000-000000000002' and event_type='ORDER_READY'),
  '0.375','PARTIAL prepared total is audited');
select is((select metadata->>'unavailable_quantity' from public.order_events
  where order_id='a8200000-0000-4000-8000-000000000002' and event_type='ORDER_READY'),
  '1.125','PARTIAL unavailable total is audited');
select ok((select event.order_item_id is null and event.reason is null
     and event.actor_user_id=orders.ready_by_user_id and event.occurred_at=orders.ready_at
     and event.previous_value='{"status":"IN_PROGRESS"}'::jsonb
     and event.new_value='{"status":"READY"}'::jsonb
   from public.order_events event
   join public.orders orders on orders.id=event.order_id
   where event.order_id='a8200000-0000-4000-8000-000000000002'
     and event.event_type='ORDER_READY'),
 'READY audit is Order-level, atomic and attributes actor/status/timestamp');
select is((select count(*)::int from public.order_items item
    where item.order_id in ('a8200000-0000-4000-8000-000000000001',
      'a8200000-0000-4000-8000-000000000002')
    and (item.requested_quantity - item.prepared_quantity - item.unavailable_quantity) <> 0),
  0,'all four items remain fully resolved');
select is((select prepared_quantity from public.order_items
  where id='a8600000-0000-4000-8000-000000000003'),
  0.375::numeric,'READY never modifies prepared quantities');
select is((select unavailable_quantity from public.order_items
  where id='a8600000-0000-4000-8000-000000000004'),
  0.500::numeric,'READY never modifies unavailable quantities');
select * from finish();
rollback;
