-- M3-004B Create Order idempotency.

begin;

select plan(9);

insert into auth.users (id, aud, role, email)
values (
  'd0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'create-order-idempotency@example.test'
);

insert into public.profiles (
  id,
  display_name,
  role,
  active
)
values (
  'd0000000-0000-4000-8000-000000000001',
  'Create Order Idempotency Customer',
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
  'd1000000-0000-4000-8000-000000000001',
  'Create Order Idempotency Business',
  '20 Retry Street',
  true
);

insert into public.business_memberships (
  id,
  user_id,
  business_id,
  active
)
values (
  'd2000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  true
);

insert into public.categories (
  id,
  name,
  active,
  display_order
)
values (
  'd3000000-0000-4000-8000-000000000001',
  'Create Order Idempotency Category',
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
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'Create Order Idempotency Product',
  'EACH',
  1.000,
  true,
  true
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"d0000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select ok(
  public.create_order(
    'd1000000-0000-4000-8000-000000000001',
    '2026-10-14 09:00:00+00',
    'First submission.',
    'd5000000-0000-4000-8000-000000000001',
    '[
      {
        "product_id": "d4000000-0000-4000-8000-000000000001",
        "requested_quantity": 2
      }
    ]'::jsonb
  ) is not null,
  'first submission creates an Order'
);

select is(
  public.create_order(
    'd1000000-0000-4000-8000-000000000001',
    '2026-10-14 09:00:00+00',
    'First submission.',
    'd5000000-0000-4000-8000-000000000001',
    '[
      {
        "product_id": "d4000000-0000-4000-8000-000000000001",
        "requested_quantity": 2
      }
    ]'::jsonb
  ),
  (
    select id
    from public.orders
    where created_by_user_id =
      'd0000000-0000-4000-8000-000000000001'
      and idempotency_key =
      'd5000000-0000-4000-8000-000000000001'
  ),
  'retry with the same idempotency key returns the existing Order id'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where created_by_user_id =
      'd0000000-0000-4000-8000-000000000001'
      and idempotency_key =
      'd5000000-0000-4000-8000-000000000001'
  ),
  1,
  'retry does not create a duplicate Order'
);

select is(
  (
    select count(*)::int
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.idempotency_key =
      'd5000000-0000-4000-8000-000000000001'
  ),
  1,
  'retry does not duplicate OrderItems'
);

select is(
  (
    select count(*)::int
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.idempotency_key =
      'd5000000-0000-4000-8000-000000000001'
  ),
  1,
  'retry does not duplicate ORDER_CREATED'
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"d0000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select isnt(
  public.create_order(
    'd1000000-0000-4000-8000-000000000001',
    '2026-10-14 10:00:00+00',
    'Intentional second Order.',
    'd5000000-0000-4000-8000-000000000002',
    '[
      {
        "product_id": "d4000000-0000-4000-8000-000000000001",
        "requested_quantity": 1
      }
    ]'::jsonb
  ),
  (
    select id
    from public.orders
    where idempotency_key =
      'd5000000-0000-4000-8000-000000000001'
  ),
  'different idempotency key creates a different Order'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where created_by_user_id =
      'd0000000-0000-4000-8000-000000000001'
  ),
  2,
  'different idempotency key persists a second intentional Order'
);

select is(
  (
    select count(*)::int
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.created_by_user_id =
      'd0000000-0000-4000-8000-000000000001'
  ),
  2,
  'two intentional Orders have two OrderItems'
);

select is(
  (
    select count(*)::int
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.created_by_user_id =
      'd0000000-0000-4000-8000-000000000001'
  ),
  2,
  'two intentional Orders have two ORDER_CREATED events'
);

select * from finish();

rollback;