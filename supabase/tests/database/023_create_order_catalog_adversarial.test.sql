-- M3-005B Create Order Product and quantity adversarial validation.

begin;

select plan(14);

insert into auth.users (id, aud, role, email)
values (
  'a6000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'catalog-adversarial-customer@example.test'
);

insert into public.profiles (
  id,
  display_name,
  role,
  active
)
values (
  'a6000000-0000-4000-8000-000000000001',
  'Catalog Adversarial Customer',
  'CUSTOMER',
  true
);

insert into public.businesses (
  id,
  name,
  delivery_address,
  active
)
values (
  'a6100000-0000-4000-8000-000000000001',
  'Catalog Adversarial Business',
  '500 Catalog Street',
  true
);

insert into public.business_memberships (
  id,
  user_id,
  business_id,
  active
)
values (
  'a6200000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  'a6100000-0000-4000-8000-000000000001',
  true
);

insert into public.categories (
  id,
  name,
  active,
  display_order
)
values
  (
    'a6300000-0000-4000-8000-000000000001',
    'Catalog Adversarial Active Category',
    true,
    0
  ),
  (
    'a6300000-0000-4000-8000-000000000002',
    'Catalog Adversarial Inactive Category',
    false,
    1
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
values
  (
    'a6400000-0000-4000-8000-000000000001',
    'a6300000-0000-4000-8000-000000000001',
    'Catalog Valid Product',
    'KG',
    0.500,
    true,
    true
  ),
  (
    'a6400000-0000-4000-8000-000000000002',
    'a6300000-0000-4000-8000-000000000001',
    'Catalog Inactive Product',
    'KG',
    0.500,
    false,
    true
  ),
  (
    'a6400000-0000-4000-8000-000000000003',
    'a6300000-0000-4000-8000-000000000001',
    'Catalog Unavailable Product',
    'KG',
    0.500,
    true,
    false
  ),
  (
    'a6400000-0000-4000-8000-000000000004',
    'a6300000-0000-4000-8000-000000000002',
    'Catalog Product In Inactive Category',
    'KG',
    0.500,
    true,
    true
  );

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"a6000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000001',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000002",
        "requested_quantity": 1.000
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'inactive Product cannot be confirmed'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000002',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000003",
        "requested_quantity": 1.000
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'unavailable Product cannot be confirmed'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000003',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000004",
        "requested_quantity": 1.000
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'Product in inactive Category cannot be confirmed'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000004',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000099",
        "requested_quantity": 1.000
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'nonexistent Product receives the same safe validation failure'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000005',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000001",
        "requested_quantity": 0
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'zero requested quantity is rejected'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000006',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000001",
        "requested_quantity": -0.500
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'negative requested quantity is rejected'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000007',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000001",
        "requested_quantity": 1.250
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'requested quantity must match the current Product quantity step'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000008',
      '[{
        "requested_quantity": 1.000
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'missing Product id is rejected'
);

select throws_ok(
  $$
    select public.create_order(
      'a6100000-0000-4000-8000-000000000001',
      '2026-10-15 10:00:00+00',
      null,
      'a6500000-0000-4000-8000-000000000009',
      '[{
        "product_id": "a6400000-0000-4000-8000-000000000001"
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'missing requested quantity is rejected'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where created_by_user_id =
      'a6000000-0000-4000-8000-000000000001'
  ),
  0,
  'rejected Product and quantity attacks leave no Orders'
);

select is(
  (
    select count(*)::int
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.created_by_user_id =
      'a6000000-0000-4000-8000-000000000001'
  ),
  0,
  'rejected Product and quantity attacks leave no OrderItems'
);

select is(
  (
    select count(*)::int
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.created_by_user_id =
      'a6000000-0000-4000-8000-000000000001'
  ),
  0,
  'rejected Product and quantity attacks leave no audit events'
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"a6000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select ok(
  public.create_order(
    'a6100000-0000-4000-8000-000000000001',
    '2026-10-15 10:00:00+00',
    null,
    'a6500000-0000-4000-8000-000000000010',
    '[{
      "product_id": "a6400000-0000-4000-8000-000000000001",
      "requested_quantity": 1.500
    }]'::jsonb
  ) is not null,
  'valid Product and exact quantity still succeed after rejected attacks'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where created_by_user_id =
      'a6000000-0000-4000-8000-000000000001'
  ),
  1,
  'only the valid command persists an Order'
);

select * from finish();

rollback;