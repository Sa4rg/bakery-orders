-- M3-005A Create Order caller and Business authorization adversarial tests.

begin;

select plan(12);

-- ---------------------------------------------------------------------------
-- Identities
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values
  (
    'f0000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'adversarial-customer-a@example.test'
  ),
  (
    'f0000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'adversarial-customer-b@example.test'
  ),
  (
    'f0000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'adversarial-inactive-customer@example.test'
  ),
  (
    'f0000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'adversarial-kitchen@example.test'
  ),
  (
    'f0000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'adversarial-manager@example.test'
  ),
  (
    'f0000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'adversarial-no-profile@example.test'
  );

insert into public.profiles (id, display_name, role, active)
values
  (
    'f0000000-0000-4000-8000-000000000001',
    'Adversarial Customer A',
    'CUSTOMER',
    true
  ),
  (
    'f0000000-0000-4000-8000-000000000002',
    'Adversarial Customer B',
    'CUSTOMER',
    true
  ),
  (
    'f0000000-0000-4000-8000-000000000003',
    'Adversarial Inactive Customer',
    'CUSTOMER',
    false
  ),
  (
    'f0000000-0000-4000-8000-000000000004',
    'Adversarial Kitchen',
    'KITCHEN',
    true
  ),
  (
    'f0000000-0000-4000-8000-000000000005',
    'Adversarial Manager',
    'MANAGER',
    true
  );

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------

insert into public.businesses (
  id,
  name,
  delivery_address,
  active
)
values
  (
    'f1000000-0000-4000-8000-000000000001',
    'Adversarial Business A',
    '100 Business A Street',
    true
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'Adversarial Business B',
    '200 Business B Street',
    true
  ),
  (
    'f1000000-0000-4000-8000-000000000003',
    'Adversarial Inactive Business',
    '300 Inactive Street',
    false
  ),
  (
    'f1000000-0000-4000-8000-000000000004',
    'Adversarial Inactive Membership Business',
    '400 Membership Street',
    true
  );

insert into public.business_memberships (
  id,
  user_id,
  business_id,
  active
)
values
  (
    'f2000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f0000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000004',
    'f0000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000003',
    true
  ),
  (
    'f2000000-0000-4000-8000-000000000005',
    'f0000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000004',
    false
  );

-- ---------------------------------------------------------------------------
-- Valid catalog fixture
-- ---------------------------------------------------------------------------

insert into public.categories (
  id,
  name,
  active,
  display_order
)
values (
  'f3000000-0000-4000-8000-000000000001',
  'Adversarial Authorization Category',
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
  'f4000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000001',
  'Adversarial Authorization Product',
  'EACH',
  1.000,
  true,
  true
);

-- ---------------------------------------------------------------------------
-- anon cannot execute
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000001',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000001',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  null,
  'anon cannot execute create_order'
);

reset role;

-- ---------------------------------------------------------------------------
-- Inactive CUSTOMER
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"f0000000-0000-4000-8000-000000000003"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000001',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000002',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'inactive CUSTOMER cannot create an Order'
);

reset role;

-- ---------------------------------------------------------------------------
-- Auth identity without Profile
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"f0000000-0000-4000-8000-000000000006"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000001',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000003',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'authenticated identity without Profile cannot create an Order'
);

reset role;

-- ---------------------------------------------------------------------------
-- KITCHEN cannot place CUSTOMER orders
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"f0000000-0000-4000-8000-000000000004"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000001',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000004',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'KITCHEN cannot create CUSTOMER orders'
);

reset role;

-- ---------------------------------------------------------------------------
-- MANAGER cannot place CUSTOMER orders
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"f0000000-0000-4000-8000-000000000005"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000001',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000005',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'MANAGER cannot create CUSTOMER orders'
);

reset role;

-- ---------------------------------------------------------------------------
-- Active CUSTOMER A
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"f0000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000002',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000006',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'CUSTOMER cannot create an Order for another Business'
);

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000004',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000007',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'inactive BusinessMembership cannot authorize Order creation'
);

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000003',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000008',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'inactive Business cannot create new Orders'
);

select throws_ok(
  $$
    select public.create_order(
      'f1000000-0000-4000-8000-000000000099',
      '2026-10-15 09:00:00+00',
      null,
      'f5000000-0000-4000-8000-000000000009',
      '[{
        "product_id": "f4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }]'::jsonb
    )
  $$,
  '42501',
  'Order creation is not allowed.',
  'nonexistent Business receives the same safe authorization failure'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where created_by_user_id in (
      'f0000000-0000-4000-8000-000000000001',
      'f0000000-0000-4000-8000-000000000003',
      'f0000000-0000-4000-8000-000000000004',
      'f0000000-0000-4000-8000-000000000005'
    )
  ),
  0,
  'all denied authorization attempts leave no Orders behind'
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"f0000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select ok(
  public.create_order(
    'f1000000-0000-4000-8000-000000000001',
    '2026-10-15 09:00:00+00',
    null,
    'f5000000-0000-4000-8000-000000000010',
    '[{
      "product_id": "f4000000-0000-4000-8000-000000000001",
      "requested_quantity": 1
    }]'::jsonb
  ) is not null,
  'active CUSTOMER with active membership in active Business can create an Order'
);

reset role;

select results_eq(
  $$
    select
      business_id,
      created_by_user_id,
      status::text
    from public.orders
    where idempotency_key =
      'f5000000-0000-4000-8000-000000000010'
  $$,
  $$
    values (
      'f1000000-0000-4000-8000-000000000001'::uuid,
      'f0000000-0000-4000-8000-000000000001'::uuid,
      'RECEIVED'::text
    )
  $$,
  'authorized creation persists the trusted Business and authenticated CUSTOMER'
);

select * from finish();

rollback;