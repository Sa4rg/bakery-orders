-- M5-002A RED -> GREEN: a least-privilege shortage projection for CUSTOMER.
-- Existing order_events RLS must continue blocking direct CUSTOMER reads.
begin;
select no_plan();

insert into auth.users (id, aud, role, email) values
('a2000000-0000-4000-8000-000000000001','authenticated','authenticated','m5002-customer-a@example.test'),
('a2000000-0000-4000-8000-000000000002','authenticated','authenticated','m5002-customer-a-colleague@example.test'),
('a2000000-0000-4000-8000-000000000003','authenticated','authenticated','m5002-customer-b@example.test'),
('a2000000-0000-4000-8000-000000000004','authenticated','authenticated','m5002-no-membership@example.test'),
('a2000000-0000-4000-8000-000000000005','authenticated','authenticated','m5002-inactive-customer@example.test'),
('a2000000-0000-4000-8000-000000000006','authenticated','authenticated','m5002-kitchen@example.test'),
('a2000000-0000-4000-8000-000000000007','authenticated','authenticated','m5002-manager@example.test'),
('a2000000-0000-4000-8000-000000000008','authenticated','authenticated','m5002-inactive-member@example.test');

insert into public.profiles (id, display_name, role, active) values
('a2000000-0000-4000-8000-000000000001','M5 Customer A','CUSTOMER',true),
('a2000000-0000-4000-8000-000000000002','M5 Customer A Colleague','CUSTOMER',true),
('a2000000-0000-4000-8000-000000000003','M5 Customer B','CUSTOMER',true),
('a2000000-0000-4000-8000-000000000004','M5 Customer No Membership','CUSTOMER',true),
('a2000000-0000-4000-8000-000000000005','M5 Inactive Customer','CUSTOMER',false),
('a2000000-0000-4000-8000-000000000006','M5 Kitchen','KITCHEN',true),
('a2000000-0000-4000-8000-000000000007','M5 Manager','MANAGER',true),
('a2000000-0000-4000-8000-000000000008','M5 Inactive Member','CUSTOMER',true);

insert into public.businesses (id,name,active) values
('a2100000-0000-4000-8000-000000000001','M5 Business A',true),
('a2100000-0000-4000-8000-000000000002','M5 Business B',true);

insert into public.business_memberships (user_id,business_id,active) values
('a2000000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001',true),
('a2000000-0000-4000-8000-000000000002','a2100000-0000-4000-8000-000000000001',true),
('a2000000-0000-4000-8000-000000000003','a2100000-0000-4000-8000-000000000002',true),
('a2000000-0000-4000-8000-000000000005','a2100000-0000-4000-8000-000000000001',true),
('a2000000-0000-4000-8000-000000000008','a2100000-0000-4000-8000-000000000001',false);

insert into public.orders (id,business_id,created_by_user_id,status,requested_delivery_at,idempotency_key) values
('a2200000-0000-4000-8000-000000000001','a2100000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','IN_PROGRESS','2026-11-08T10:00:00Z','a2300000-0000-4000-8000-000000000001'),
('a2200000-0000-4000-8000-000000000002','a2100000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000003','IN_PROGRESS','2026-11-08T10:00:00Z','a2300000-0000-4000-8000-000000000002');

insert into public.categories (id,name,active,display_order) values
('a2400000-0000-4000-8000-000000000001','M5 Category',true,20);
insert into public.products (id,category_id,name,unit_code,quantity_step,active,available) values
('a2500000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000001','M5 Historical Product','UNIT',1,true,true);

insert into public.order_items (
  id,order_id,product_id,product_name_snapshot,unit_code_snapshot,
  quantity_step_snapshot,requested_quantity,prepared_quantity,unavailable_quantity
) values
('a2600000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001','a2500000-0000-4000-8000-000000000001','M5 Historical Product','UNIT',1,4,1,3),
('a2600000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000002','a2500000-0000-4000-8000-000000000001','M5 Historical Product','UNIT',1,2,0,2);

insert into public.order_events (
  id,order_id,order_item_id,actor_user_id,event_type,reason,metadata,occurred_at
) values
('a2700000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001','a2600000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000006','QUANTITY_UNAVAILABLE','First missing batch','{}','2026-11-02T08:00:00Z'),
('a2700000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000001','a2600000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000006','QUANTITY_UNAVAILABLE','Second missing batch','{}','2026-11-02T08:01:00Z'),
('a2700000-0000-4000-8000-000000000003','a2200000-0000-4000-8000-000000000002','a2600000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000006','QUANTITY_UNAVAILABLE','Private B reason','{}','2026-11-02T08:02:00Z'),
('a2700000-0000-4000-8000-000000000004','a2200000-0000-4000-8000-000000000001','a2600000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000006','QUANTITY_PREPARED','Internal note not for Customer','{}','2026-11-02T08:03:00Z');

select ok(pg_catalog.to_regprocedure('public.get_customer_order_unavailability_reasons(uuid)') is not null,
  'narrow CUSTOMER shortage RPC exists');
select is((select p.prosecdef from pg_catalog.pg_proc p
  where p.oid = 'public.get_customer_order_unavailability_reasons(uuid)'::regprocedure),true,
  'projection is SECURITY DEFINER');
select is((select p.provolatile from pg_catalog.pg_proc p
  where p.oid = 'public.get_customer_order_unavailability_reasons(uuid)'::regprocedure),'s',
  'projection is read-only STABLE');
select is((select p.proowner::regrole::text from pg_catalog.pg_proc p
  where p.oid = 'public.get_customer_order_unavailability_reasons(uuid)'::regprocedure),'postgres',
  'function runs under postgres ownership');
select ok((select 'search_path=' = any(p.proconfig) or 'search_path=""' = any(p.proconfig)
  from pg_catalog.pg_proc p where p.oid = 'public.get_customer_order_unavailability_reasons(uuid)'::regprocedure),
  'SECURITY DEFINER fixes empty search_path');
select ok(has_function_privilege('authenticated','public.get_customer_order_unavailability_reasons(uuid)','EXECUTE'),
  'authenticated can invoke after role check');
select ok(not has_function_privilege('anon','public.get_customer_order_unavailability_reasons(uuid)','EXECUTE'),
  'anon cannot execute projection');
select ok(not exists (
  select 1 from pg_catalog.pg_proc as p
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) as acl
  where p.oid = 'public.get_customer_order_unavailability_reasons(uuid)'::regprocedure
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 'PUBLIC cannot execute projection');
select ok(not has_table_privilege('authenticated','public.order_events','INSERT'),
  'authenticated cannot write events directly');
select ok((select pg_catalog.pg_get_function_result(p.oid) =
  'TABLE(order_item_id uuid, reason text, occurred_at timestamp with time zone)'
  from pg_catalog.pg_proc p
  where p.oid = 'public.get_customer_order_unavailability_reasons(uuid)'::regprocedure),
  'function result projects only the three approved fields');

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000001"}',true);
select results_eq(
  $$select order_item_id,reason,occurred_at from public.get_customer_order_unavailability_reasons(
     'a2200000-0000-4000-8000-000000000001')$$,
  $$values
    ('a2600000-0000-4000-8000-000000000001'::uuid,'First missing batch'::text,'2026-11-02T08:00:00Z'::timestamptz),
    ('a2600000-0000-4000-8000-000000000001'::uuid,'Second missing batch'::text,'2026-11-02T08:01:00Z'::timestamptz)$$,
  'Customer A sees only its ordered historical shortage reasons');
select is_empty($$select * from public.order_events$$,
  'the direct event audit table remains invisible to CUSTOMER');
select is_empty($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000002')$$,
  'foreign Business Order returns no reasons');
select is_empty($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000099')$$,
  'nonexistent Order returns the same empty result');
select throws_ok(
  $$select * from public.get_customer_order_unavailability_reasons(null::uuid)$$,
  '22023',null,'NULL Order ID fails validation');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000002"}',true);
select results_eq(
  $$select reason from public.get_customer_order_unavailability_reasons(
    'a2200000-0000-4000-8000-000000000001')$$,
  $$values ('First missing batch'::text),('Second missing batch'::text)$$,
  'another active Customer of the same Business sees the shortages');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000003"}',true);
select results_eq(
  $$select reason from public.get_customer_order_unavailability_reasons(
    'a2200000-0000-4000-8000-000000000002')$$,
  $$values ('Private B reason'::text)$$,
  'Customer B sees only its own Business');
reset role;

-- The same SQLSTATE is used for all users without CUSTOMER authorization.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000001')$$,'42501',null,
  'active profile without membership denied');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000005"}',true);
select throws_ok($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000001')$$,'42501',null,
  'inactive profile denied');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000008"}',true);
select throws_ok($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000001')$$,'42501',null,
  'inactive membership denied');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000006"}',true);
select throws_ok($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000001')$$,'42501',null,
  'KITCHEN is not a CUSTOMER and cannot use the projection');
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000007"}',true);
select throws_ok($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000001')$$,'42501',null,
  'MANAGER is not a CUSTOMER and cannot use the projection');
reset role;

set local role anon;
select pg_catalog.set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000001')$$,'42501',null,
  'ANON cannot execute the function');
reset role;

-- Verify revoking a previously valid membership closes the read immediately.
update public.business_memberships set active = false
  where user_id = 'a2000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select * from public.get_customer_order_unavailability_reasons(
  'a2200000-0000-4000-8000-000000000001')$$,'42501',null,
  'revoked membership blocks subsequent reasons lookup');
reset role;

select * from finish();
rollback;
