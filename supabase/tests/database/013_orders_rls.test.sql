-- M3-001E Order RLS, role visibility and direct-write boundary.

begin;

select plan(15);

insert into auth.users (id, aud, role, email)
values
  ('83000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'orders-customer-a@example.test'),
  ('83000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'orders-customer-b@example.test'),
  ('83000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'orders-no-membership@example.test'),
  ('83000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'orders-inactive-customer@example.test'),
  ('83000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'orders-kitchen@example.test'),
  ('83000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'orders-manager@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('83000000-0000-4000-8000-000000000001', 'Orders Customer A', 'CUSTOMER', true),
  ('83000000-0000-4000-8000-000000000002', 'Orders Customer B', 'CUSTOMER', true),
  ('83000000-0000-4000-8000-000000000003', 'Orders Customer Without Membership', 'CUSTOMER', true),
  ('83000000-0000-4000-8000-000000000004', 'Inactive Orders Customer', 'CUSTOMER', false),
  ('83000000-0000-4000-8000-000000000005', 'Orders Kitchen', 'KITCHEN', true),
  ('83000000-0000-4000-8000-000000000006', 'Orders Manager', 'MANAGER', true);

insert into public.businesses (id, name, active)
values
  ('84000000-0000-4000-8000-000000000001', 'Orders Business A', true),
  ('84000000-0000-4000-8000-000000000002', 'Orders Business B', true);

insert into public.business_memberships (id, user_id, business_id, active)
values
  (
    '85000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '85000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000002',
    '84000000-0000-4000-8000-000000000002',
    true
  ),
  (
    '85000000-0000-4000-8000-000000000003',
    '83000000-0000-4000-8000-000000000004',
    '84000000-0000-4000-8000-000000000001',
    true
  );

insert into public.orders (
  id,
  order_number,
  business_id,
  created_by_user_id,
  status,
  requested_delivery_at,
  idempotency_key
)
values
  (
    '86000000-0000-4000-8000-000000000001',
    9101,
    '84000000-0000-4000-8000-000000000001',
    '83000000-0000-4000-8000-000000000001',
    'RECEIVED',
    '2026-10-11 09:00:00+00',
    '87000000-0000-4000-8000-000000000001'
  ),
  (
    '86000000-0000-4000-8000-000000000002',
    9102,
    '84000000-0000-4000-8000-000000000002',
    '83000000-0000-4000-8000-000000000002',
    'RECEIVED',
    '2026-10-11 10:00:00+00',
    '87000000-0000-4000-8000-000000000002'
  );

select is(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  true,
  'RLS is enabled on orders'
);

select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege('anon', 'public.orders', privilege_name)
  ),
  0,
  'anon has no Order table privileges'
);

select ok(
  has_table_privilege('authenticated', 'public.orders', 'SELECT'),
  'authenticated can SELECT authorized Orders'
);

select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege('authenticated', 'public.orders', privilege_name)
  ),
  0,
  'authenticated has no direct Order write privileges'
);

set local role anon;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

select throws_ok(
  $$select * from public.orders$$,
  '42501',
  'permission denied for table orders',
  'anon cannot SELECT Orders'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000001"}',
    true
  );
end $$;

select results_eq(
  $$select id from public.orders order by id$$,
  $$values ('86000000-0000-4000-8000-000000000001'::uuid)$$,
  'CUSTOMER reads only Orders belonging to their active membership Business'
);

select throws_ok(
  $$insert into public.orders (
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key
    )
    values (
      '84000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000001',
      'RECEIVED',
      '2026-10-12 09:00:00+00',
      '87000000-0000-4000-8000-000000000010'
    )$$,
  '42501',
  null,
  'CUSTOMER cannot directly INSERT Orders'
);

select throws_ok(
  $$update public.orders
    set status = 'DELIVERED'
    where id = '86000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'CUSTOMER cannot directly UPDATE Order lifecycle'
);

select throws_ok(
  $$delete from public.orders
    where id = '86000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'CUSTOMER cannot DELETE Orders'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000003"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.orders$$,
  'CUSTOMER without an active membership sees no Orders'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000004"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.orders$$,
  'inactive CUSTOMER Profile sees no Orders'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000005"}',
    true
  );
end $$;

select results_eq(
  $$select id from public.orders order by id$$,
  $$values
      ('86000000-0000-4000-8000-000000000001'::uuid),
      ('86000000-0000-4000-8000-000000000002'::uuid)$$,
  'active KITCHEN reads operational Orders across Businesses'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"83000000-0000-4000-8000-000000000006"}',
    true
  );
end $$;

select results_eq(
  $$select id from public.orders order by id$$,
  $$values
      ('86000000-0000-4000-8000-000000000001'::uuid),
      ('86000000-0000-4000-8000-000000000002'::uuid)$$,
  'active MANAGER reads Orders across Businesses'
);

select throws_ok(
  $$update public.orders
    set status = 'DELIVERED'
    where id = '86000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'MANAGER cannot bypass trusted lifecycle commands with direct UPDATE'
);

reset role;

select is(
  (
    select status
    from public.orders
    where id = '86000000-0000-4000-8000-000000000001'
  ),
  'RECEIVED'::public.order_status,
  'denied writes leave Order state unchanged'
);

select * from finish();

rollback;