-- M3-005C Create Order trust boundary, mass assignment and isolation.

begin;

select plan(16);

insert into auth.users (id, aud, role, email)
values
  (
    'b6000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'trust-boundary-customer-a@example.test'
  ),
  (
    'b6000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'trust-boundary-customer-b@example.test'
  );

insert into public.profiles (
  id,
  display_name,
  role,
  active
)
values
  (
    'b6000000-0000-4000-8000-000000000001',
    'Trust Boundary Customer A',
    'CUSTOMER',
    true
  ),
  (
    'b6000000-0000-4000-8000-000000000002',
    'Trust Boundary Customer B',
    'CUSTOMER',
    true
  );

insert into public.businesses (
  id,
  name,
  delivery_address,
  active
)
values
  (
    'b6100000-0000-4000-8000-000000000001',
    'Trust Boundary Business A',
    '600 Trusted A Street',
    true
  ),
  (
    'b6100000-0000-4000-8000-000000000002',
    'Trust Boundary Business B',
    '700 Trusted B Street',
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
    'b6200000-0000-4000-8000-000000000001',
    'b6000000-0000-4000-8000-000000000001',
    'b6100000-0000-4000-8000-000000000001',
    true
  ),
  (
    'b6200000-0000-4000-8000-000000000002',
    'b6000000-0000-4000-8000-000000000002',
    'b6100000-0000-4000-8000-000000000002',
    true
  );

insert into public.categories (
  id,
  name,
  active,
  display_order
)
values (
  'b6300000-0000-4000-8000-000000000001',
  'Trust Boundary Category',
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
  'b6400000-0000-4000-8000-000000000001',
  'b6300000-0000-4000-8000-000000000001',
  'Trusted Product Name',
  'KG',
  0.500,
  true,
  true
);

-- ---------------------------------------------------------------------------
-- CUSTOMER A attempts mass assignment
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b6000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select ok(
  public.create_order(
    'b6100000-0000-4000-8000-000000000001',
    '2026-10-15 11:00:00+00',
    'Original trusted notes.',
    'b6500000-0000-4000-8000-000000000001',
    '[
      {
        "product_id": "b6400000-0000-4000-8000-000000000001",
        "requested_quantity": 2.000,

        "status": "DELIVERED",
        "business_id": "b6100000-0000-4000-8000-000000000002",
        "created_by_user_id": "b6000000-0000-4000-8000-000000000002",

        "product_name_snapshot": "FORGED PRODUCT",
        "unit_code_snapshot": "FORGED",
        "quantity_step_snapshot": 99,

        "prepared_quantity": 2,
        "unavailable_quantity": 2,

        "actor_user_id": "b6000000-0000-4000-8000-000000000002",
        "event_type": "ORDER_DELIVERED",
        "occurred_at": "2000-01-01T00:00:00Z"
      }
    ]'::jsonb
  ) is not null,
  'unknown privileged fields cannot prevent normal trusted command execution'
);

reset role;

select results_eq(
  $$
    select
      business_id,
      created_by_user_id,
      status::text,
      requested_delivery_at,
      delivery_address_snapshot,
      customer_notes
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'b6100000-0000-4000-8000-000000000001'::uuid,
      'b6000000-0000-4000-8000-000000000001'::uuid,
      'RECEIVED'::text,
      '2026-10-15 11:00:00+00'::timestamptz,
      '600 Trusted A Street'::text,
      'Original trusted notes.'::text
    )
  $$,
  'Order ownership, status and address remain server-derived'
);

select results_eq(
  $$
    select
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity,
      prepared_quantity,
      unavailable_quantity
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'Trusted Product Name'::text,
      'KG'::text,
      0.500::numeric,
      2.000::numeric,
      0.000::numeric,
      0.000::numeric
    )
  $$,
  'OrderItem snapshots and fulfillment quantities ignore mass-assignment fields'
);

select results_eq(
  $$
    select
      event_type,
      actor_user_id
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'ORDER_CREATED'::text,
      'b6000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'audit event type and actor are trusted and cannot be mass-assigned'
);

-- ---------------------------------------------------------------------------
-- Same key with altered payload must not mutate original persisted command
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b6000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select is(
  public.create_order(
    'b6100000-0000-4000-8000-000000000001',
    '2026-12-31 23:59:00+00',
    'Tampered retry notes.',
    'b6500000-0000-4000-8000-000000000001',
    '[{
      "product_id": "b6400000-0000-4000-8000-000000000001",
      "requested_quantity": 99.000
    }]'::jsonb
  ),
  (
    select id
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  ),
  'same idempotency key returns the already persisted Order'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  ),
  1,
  'altered retry does not create another Order'
);

select results_eq(
  $$
    select
      requested_delivery_at,
      customer_notes
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '2026-10-15 11:00:00+00'::timestamptz,
      'Original trusted notes.'::text
    )
  $$,
  'altered retry cannot modify the original Order'
);

select is(
  (
    select requested_quantity
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  ),
  2.000::numeric,
  'altered retry cannot modify original requested quantity'
);

select is(
  (
    select count(*)::int
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  ),
  1,
  'altered retry cannot duplicate initial audit history'
);

-- ---------------------------------------------------------------------------
-- CUSTOMER B cannot read CUSTOMER A persisted Order
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b6000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select is_empty(
  $$
    select 1
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  $$,
  'CUSTOMER B cannot read CUSTOMER A Order'
);

select is_empty(
  $$
    select 1
    from public.order_items
  $$,
  'CUSTOMER B cannot read CUSTOMER A OrderItems'
);

reset role;

-- ---------------------------------------------------------------------------
-- CUSTOMER A retains authorized reads
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b6000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select is(
  (
    select count(*)::int
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  ),
  1,
  'CUSTOMER A can read its own created Order'
);

select is(
  (
    select count(*)::int
    from public.order_items
  ),
  1,
  'CUSTOMER A can read its own created OrderItem'
);

reset role;

-- ---------------------------------------------------------------------------
-- Idempotency keys are scoped to the authenticated creator
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b6000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select ok(
  public.create_order(
    'b6100000-0000-4000-8000-000000000002',
    '2026-10-15 12:00:00+00',
    null,
    'b6500000-0000-4000-8000-000000000001',
    '[{
      "product_id": "b6400000-0000-4000-8000-000000000001",
      "requested_quantity": 1.000
    }]'::jsonb
  ) is not null,
  'different CUSTOMER may independently use the same idempotency UUID'
);

select is(
  (
    select count(*)::int
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  ),
  1,
  'CUSTOMER B sees only its own Order when creators share the same key'
);

reset role;

select is(
  (
    select count(*)::int
    from public.orders
    where idempotency_key =
      'b6500000-0000-4000-8000-000000000001'
  ),
  2,
  'same idempotency UUID may exist once per authenticated creator'
);

select * from finish();

rollback;