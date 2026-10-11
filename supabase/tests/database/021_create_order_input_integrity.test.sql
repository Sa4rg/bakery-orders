-- M3-004C Create Order input integrity and atomic rollback.

begin;

select plan(10);

insert into auth.users (id, aud, role, email)
values (
  'e0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'create-order-input@example.test'
);

insert into public.profiles (
  id,
  display_name,
  role,
  active
)
values (
  'e0000000-0000-4000-8000-000000000001',
  'Create Order Input Customer',
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
  'e1000000-0000-4000-8000-000000000001',
  'Create Order Input Business',
  '30 Validation Avenue',
  true
);

insert into public.business_memberships (
  id,
  user_id,
  business_id,
  active
)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  true
);

insert into public.categories (
  id,
  name,
  active,
  display_order
)
values (
  'e3000000-0000-4000-8000-000000000001',
  'Create Order Input Category',
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
  'e4000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'Create Order Input Product',
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
    '{"role":"authenticated","sub":"e0000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.create_order(
      'e1000000-0000-4000-8000-000000000001',
      null,
      null,
      'e5000000-0000-4000-8000-000000000001',
      '[{
        "product_id": "e4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1.000
      }]'::jsonb
    )
  $$,
  '22023',
  'Order input is invalid.',
  'requested delivery timestamp is required'
);

select throws_ok(
  $$
    select public.create_order(
      'e1000000-0000-4000-8000-000000000001',
      '2026-10-14 09:00:00+00',
      null,
      'e5000000-0000-4000-8000-000000000002',
      '[]'::jsonb
    )
  $$,
  '22023',
  'Order input is invalid.',
  'empty item array cannot create an Order'
);

select throws_ok(
  $$
    select public.create_order(
      'e1000000-0000-4000-8000-000000000001',
      '2026-10-14 09:00:00+00',
      null,
      'e5000000-0000-4000-8000-000000000003',
      '{}'::jsonb
    )
  $$,
  '22023',
  'Order input is invalid.',
  'items input must be a JSON array'
);

select throws_ok(
  $$
    select public.create_order(
      'e1000000-0000-4000-8000-000000000001',
      '2026-10-14 09:00:00+00',
      null,
      'e5000000-0000-4000-8000-000000000004',
      '[{
        "product_id": "not-a-uuid",
        "requested_quantity": 1.000
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'malformed Product UUID receives a safe item-validation error'
);

select throws_ok(
  $$
    select public.create_order(
      'e1000000-0000-4000-8000-000000000001',
      '2026-10-14 09:00:00+00',
      null,
      'e5000000-0000-4000-8000-000000000005',
      '[{
        "product_id": "e4000000-0000-4000-8000-000000000001",
        "requested_quantity": "not-a-number"
      }]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'malformed quantity receives a safe item-validation error'
);

select throws_ok(
  $$
    select public.create_order(
      'e1000000-0000-4000-8000-000000000001',
      '2026-10-14 09:00:00+00',
      null,
      'e5000000-0000-4000-8000-000000000006',
      '[
        {
          "product_id": "e4000000-0000-4000-8000-000000000001",
          "requested_quantity": 1.000
        },
        {
          "product_id": "e4000000-0000-4000-8000-000000000001",
          "requested_quantity": 1.250
        }
      ]'::jsonb
    )
  $$,
  '22023',
  'Order item is invalid.',
  'invalid later item rejects the whole Order command'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where idempotency_key =
      'e5000000-0000-4000-8000-000000000006'
  ),
  0,
  'failed multi-item command leaves no partial Order'
);

select is(
  (
    select count(*)::int
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.idempotency_key =
      'e5000000-0000-4000-8000-000000000006'
  ),
  0,
  'failed multi-item command leaves no partial OrderItems'
);

select is(
  (
    select count(*)::int
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.idempotency_key =
      'e5000000-0000-4000-8000-000000000006'
  ),
  0,
  'failed multi-item command leaves no partial ORDER_CREATED event'
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"e0000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select lives_ok(
  $$
    select public.create_order(
      'e1000000-0000-4000-8000-000000000001',
      '2026-10-14 09:00:00+00',
      null,
      'e5000000-0000-4000-8000-000000000006',
      '[{
        "product_id": "e4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1.500
      }]'::jsonb
    )
  $$,
  'idempotency key from a rolled-back command can be used by a later valid submission'
);

reset role;

select * from finish();

rollback;