-- M3-002E OrderItem RLS, ownership visibility and direct-write boundary.

begin;

select plan(18);

insert into auth.users (id, aud, role, email)
values
  (
    '90000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'order-items-customer-a@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'order-items-customer-b@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'order-items-no-membership@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'order-items-inactive-membership@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'order-items-inactive-customer@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'order-items-kitchen@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000007',
    'authenticated',
    'authenticated',
    'order-items-inactive-kitchen@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000008',
    'authenticated',
    'authenticated',
    'order-items-manager@example.test'
  ),
  (
    '90000000-0000-4000-8000-000000000009',
    'authenticated',
    'authenticated',
    'order-items-inactive-manager@example.test'
  );

insert into public.profiles (id, display_name, role, active)
values
  (
    '90000000-0000-4000-8000-000000000001',
    'Order Items Customer A',
    'CUSTOMER',
    true
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'Order Items Customer B',
    'CUSTOMER',
    true
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    'Order Items Customer Without Membership',
    'CUSTOMER',
    true
  ),
  (
    '90000000-0000-4000-8000-000000000004',
    'Order Items Customer With Inactive Membership',
    'CUSTOMER',
    true
  ),
  (
    '90000000-0000-4000-8000-000000000005',
    'Inactive Order Items Customer',
    'CUSTOMER',
    false
  ),
  (
    '90000000-0000-4000-8000-000000000006',
    'Order Items Kitchen',
    'KITCHEN',
    true
  ),
  (
    '90000000-0000-4000-8000-000000000007',
    'Inactive Order Items Kitchen',
    'KITCHEN',
    false
  ),
  (
    '90000000-0000-4000-8000-000000000008',
    'Order Items Manager',
    'MANAGER',
    true
  ),
  (
    '90000000-0000-4000-8000-000000000009',
    'Inactive Order Items Manager',
    'MANAGER',
    false
  );

insert into public.businesses (id, name, active)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'Order Items Business A',
    true
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'Order Items Business B',
    true
  );

insert into public.business_memberships (id, user_id, business_id, active)
values
  (
    '92000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    true
  ),
  (
    '92000000-0000-4000-8000-000000000003',
    '90000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000001',
    false
  ),
  (
    '92000000-0000-4000-8000-000000000004',
    '90000000-0000-4000-8000-000000000005',
    '91000000-0000-4000-8000-000000000001',
    true
  );

insert into public.categories (id, name, active, display_order)
values (
  '93000000-0000-4000-8000-000000000001',
  'Order Items RLS Category',
  true,
  0
);

insert into public.products (
  id,
  category_id,
  name,
  unit_code,
  quantity_step,
  active,
  available
)
values (
  '94000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'Order Items RLS Product',
  'EACH',
  0.500,
  true,
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
    '95000000-0000-4000-8000-000000000001',
    9301,
    '91000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    'RECEIVED',
    '2026-10-12 09:00:00+00',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    9302,
    '91000000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000002',
    'RECEIVED',
    '2026-10-12 10:00:00+00',
    '96000000-0000-4000-8000-000000000002'
  );

insert into public.order_items (
  id,
  order_id,
  product_id,
  product_name_snapshot,
  unit_code_snapshot,
  quantity_step_snapshot,
  requested_quantity
)
values
  (
    '97000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    'Order Items RLS Product',
    'EACH',
    0.500,
    2.000
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000002',
    '94000000-0000-4000-8000-000000000001',
    'Order Items RLS Product',
    'EACH',
    0.500,
    3.000
  );

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.order_items'::regclass
  ),
  true,
  'RLS is enabled on order_items'
);

select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(
      'anon',
      'public.order_items',
      privilege_name
    )
  ),
  0,
  'anon has no OrderItem table privileges'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.order_items',
    'SELECT'
  ),
  'authenticated can SELECT authorized OrderItems'
);

select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(
      'authenticated',
      'public.order_items',
      privilege_name
    )
  ),
  0,
  'authenticated has no direct OrderItem write privileges'
);

set local role anon;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"anon"}',
    true
  );
end $$;

select throws_ok(
  $$select * from public.order_items$$,
  '42501',
  'permission denied for table order_items',
  'anon cannot SELECT OrderItems'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000001"}',
    true
  );
end $$;

select results_eq(
  $$select id
    from public.order_items
    order by id$$,
  $$values (
      '97000000-0000-4000-8000-000000000001'::uuid
    )$$,
  'CUSTOMER reads only OrderItems belonging to an authorized Order'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '95000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      'Forged Product',
      'EACH',
      0.500,
      1.000
    )$$,
  '42501',
  null,
  'CUSTOMER cannot directly INSERT OrderItems'
);

select throws_ok(
  $$update public.order_items
    set prepared_quantity = 1.000
    where id = '97000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'CUSTOMER cannot directly UPDATE OrderItem quantities'
);

select throws_ok(
  $$delete from public.order_items
    where id = '97000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'CUSTOMER cannot DELETE OrderItems'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000003"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_items$$,
  'CUSTOMER without membership sees no OrderItems'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000004"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_items$$,
  'CUSTOMER with inactive membership sees no OrderItems'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000005"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_items$$,
  'inactive CUSTOMER Profile sees no OrderItems'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000006"}',
    true
  );
end $$;

select results_eq(
  $$select id
    from public.order_items
    order by id$$,
  $$values
      ('97000000-0000-4000-8000-000000000001'::uuid),
      ('97000000-0000-4000-8000-000000000002'::uuid)$$,
  'active KITCHEN reads OrderItems across Businesses'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000007"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_items$$,
  'inactive KITCHEN Profile sees no OrderItems'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000008"}',
    true
  );
end $$;

select results_eq(
  $$select id
    from public.order_items
    order by id$$,
  $$values
      ('97000000-0000-4000-8000-000000000001'::uuid),
      ('97000000-0000-4000-8000-000000000002'::uuid)$$,
  'active MANAGER reads OrderItems across Businesses'
);

select throws_ok(
  $$update public.order_items
    set unavailable_quantity = 0.500
    where id = '97000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'MANAGER cannot bypass trusted commands with direct OrderItem UPDATE'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000009"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_items$$,
  'inactive MANAGER Profile sees no OrderItems'
);

reset role;

select results_eq(
  $$select
      prepared_quantity,
      unavailable_quantity
    from public.order_items
    where id = '97000000-0000-4000-8000-000000000001'$$,
  $$values (
      0.000::numeric,
      0.000::numeric
    )$$,
  'denied writes leave OrderItem quantities unchanged'
);

select * from finish();

rollback;