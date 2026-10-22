-- M4-001B: narrow Business name projection for KITCHEN.
-- Existing Business SELECT RLS remains CUSTOMER-membership scoped.
-- The whole test rolls back, including fixture inserts.

begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- Trusted fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values
  ('97000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'm4-read-customer-a@example.test'),
  ('97000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm4-read-customer-b@example.test'),
  ('97000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'm4-read-kitchen@example.test'),
  ('97000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'm4-read-kitchen-member@example.test'),
  ('97000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'm4-read-inactive-kitchen@example.test'),
  ('97000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'm4-read-manager@example.test'),
  ('97000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'm4-read-no-profile@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('97000000-0000-4000-8000-000000000001', 'Read Customer A', 'CUSTOMER', true),
  ('97000000-0000-4000-8000-000000000002', 'Read Customer B', 'CUSTOMER', true),
  ('97000000-0000-4000-8000-000000000003', 'Read Kitchen Without Membership', 'KITCHEN', true),
  ('97000000-0000-4000-8000-000000000004', 'Read Kitchen With Accidental Membership', 'KITCHEN', true),
  ('97000000-0000-4000-8000-000000000005', 'Read Inactive Kitchen', 'KITCHEN', false),
  ('97000000-0000-4000-8000-000000000006', 'Read Manager', 'MANAGER', true);

insert into public.businesses (
  id, name, active, contact_name, contact_phone, delivery_address, notes
)
values
  (
    '97100000-0000-4000-8000-000000000001', 'Read Business A', true,
    'Private Contact A', '999100001', 'Private Address A', 'Private Note A'
  ),
  (
    '97100000-0000-4000-8000-000000000002', 'Read Inactive Business B', false,
    'Private Contact B', '999100002', 'Private Address B', 'Private Note B'
  ),
  (
    '97100000-0000-4000-8000-000000000003', 'Read Business Without Order', true,
    'Private Contact C', '999100003', 'Private Address C', 'Private Note C'
  );

insert into public.business_memberships (id, user_id, business_id, active)
values
  (
    '97200000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    '97100000-0000-4000-8000-000000000001', true
  ),
  (
    '97200000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000002',
    '97100000-0000-4000-8000-000000000002', true
  ),
  (
    '97200000-0000-4000-8000-000000000003',
    '97000000-0000-4000-8000-000000000004',
    '97100000-0000-4000-8000-000000000001', true
  );

insert into public.orders (
  id, business_id, created_by_user_id, status,
  requested_delivery_at, idempotency_key
)
values
  (
    '97300000-0000-4000-8000-000000000001',
    '97100000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    'RECEIVED', '2026-10-23T09:00:00Z',
    '97400000-0000-4000-8000-000000000001'
  ),
  (
    '97300000-0000-4000-8000-000000000002',
    '97100000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000002',
    'RECEIVED', '2026-10-24T09:00:00Z',
    '97400000-0000-4000-8000-000000000002'
  );

-- ---------------------------------------------------------------------------
-- Function shape and execution privileges
-- ---------------------------------------------------------------------------

select ok(
  pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])') is not null,
  'KITCHEN Business read function exists'
);

select is(
  (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])')
  ),
  true,
  'read function uses SECURITY DEFINER'
);

select ok(
  (
    select coalesce(p.proconfig @> array['search_path=""']::text[], false)
    from pg_catalog.pg_proc as p
    where p.oid = pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])')
  ),
  'read function fixes an empty search_path'
);

select is(
  (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])')
  ),
  'postgres',
  'read function belongs to trusted postgres owner'
);

select is(
  pg_catalog.pg_get_function_result(
    pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])')
  ),
  'TABLE(id uuid, name text)',
  'read projection exposes exactly id and name'
);

select ok(
  coalesce(
    has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])'),
      'EXECUTE'
    ), false
  ),
  'authenticated has EXECUTE (application role checked inside function)'
);

select ok(
  not coalesce(
    has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])'),
      'EXECUTE'
    ), false
  ),
  'anon cannot EXECUTE the read function'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    ) as acl
    where proc.oid = pg_catalog.to_regprocedure('public.get_kitchen_order_business_names(uuid[])')
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot EXECUTE the read function'
);

select ok(
  not has_table_privilege('authenticated', 'public.businesses', 'UPDATE'),
  'authenticated still cannot UPDATE Business directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.orders', 'UPDATE'),
  'authenticated still cannot UPDATE Orders directly'
);

-- ---------------------------------------------------------------------------
-- Active KITCHEN without BusinessMembership
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000003"}',
  true
);

select results_eq(
  $$
    select id, name
    from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000002'::uuid,
      '97100000-0000-4000-8000-000000000001'::uuid,
      '97100000-0000-4000-8000-000000000003'::uuid,
      '97100000-0000-4000-8000-000000000099'::uuid
    ])
    order by id
  $$,
  $$values
      ('97100000-0000-4000-8000-000000000001'::uuid, 'Read Business A'::text),
      ('97100000-0000-4000-8000-000000000002'::uuid, 'Read Inactive Business B'::text)
  $$,
  'active KITCHEN sees requested Businesses with Orders, including inactive historical Business'
);

select is_empty(
  $$select 1 from public.businesses$$,
  'KITCHEN cannot SELECT businesses directly even after projection is installed'
);

select is_empty(
  $$select 1 from public.business_memberships$$,
  'KITCHEN does not acquire BusinessMembership SELECT visibility'
);

select is_empty(
  $$
    select id from public.get_kitchen_order_business_names(array[]::uuid[])
  $$,
  'empty requested set yields no Business names'
);

select results_eq(
  $$
    select id
    from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000001'::uuid,
      '97100000-0000-4000-8000-000000000001'::uuid
    ])
  $$,
  $$values ('97100000-0000-4000-8000-000000000001'::uuid)$$,
  'duplicate Business identifiers produce no duplicate rows'
);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(null::uuid[])$$,
  '22023', null,
  'null Business id array is rejected'
);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(array[null::uuid])$$,
  '22023', null,
  'array containing a null Business id is rejected'
);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(
      array_fill('97100000-0000-4000-8000-000000000001'::uuid, array[101])
    )$$,
  '22023', null,
  'Business id array exceeding 100 elements is rejected'
);

reset role;

-- ---------------------------------------------------------------------------
-- Active KITCHEN with an accidental BusinessMembership
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000004"}',
  true
);

select results_eq(
  $$
    select id
    from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000001'::uuid,
      '97100000-0000-4000-8000-000000000002'::uuid
    ])
    order by id
  $$,
  $$values
      ('97100000-0000-4000-8000-000000000001'::uuid),
      ('97100000-0000-4000-8000-000000000002'::uuid)
  $$,
  'KITCHEN authorization is bakery-wide regardless of accidental membership'
);

select is_empty(
  $$select 1 from public.businesses$$,
  'accidental KITCHEN membership does not grant direct Business SELECT visibility'
);

reset role;

-- ---------------------------------------------------------------------------
-- Forbidden roles and inactive identities
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000001"}',
  true
);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000001'::uuid
    ])$$,
  '42501', null,
  'CUSTOMER cannot invoke the KITCHEN-only projection even with membership'
);

select results_eq(
  $$select id from public.businesses$$,
  $$values ('97100000-0000-4000-8000-000000000001'::uuid)$$,
  'CUSTOMER can still see their authorized Business under existing RLS'
);

reset role;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000006"}',
  true
);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000001'::uuid
    ])$$,
  '42501', null,
  'MANAGER cannot invoke this KITCHEN-only projection'
);

reset role;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000005"}',
  true
);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000001'::uuid
    ])$$,
  '42501', null,
  'inactive KITCHEN cannot invoke the projection'
);

reset role;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"97000000-0000-4000-8000-000000000007"}',
  true
);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000001'::uuid
    ])$$,
  '42501', null,
  'authenticated user without Profile cannot invoke the projection'
);

reset role;
set local role anon;
select pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select * from public.get_kitchen_order_business_names(array[
      '97100000-0000-4000-8000-000000000001'::uuid
    ])$$,
  '42501', null,
  'anonymous role has no EXECUTE on the projection'
);

reset role;

select * from finish();
rollback;
