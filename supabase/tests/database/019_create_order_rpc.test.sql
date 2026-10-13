-- M3-004A Create Order RPC: trusted boundary and successful atomic creation.

begin;

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values (
  'c0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'create-order-customer@example.test'
);

insert into public.profiles (id, display_name, role, active)
values (
  'c0000000-0000-4000-8000-000000000001',
  'Create Order Customer',
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
  'c1000000-0000-4000-8000-000000000001',
  'Create Order Business',
  '12 Test Bakery Street',
  true
);

insert into public.business_memberships (
  id,
  user_id,
  business_id,
  active
)
values (
  'c2000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  true
);

insert into public.categories (
  id,
  name,
  active,
  display_order
)
values (
  'c3000000-0000-4000-8000-000000000001',
  'Create Order Category',
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
values
  (
    'c4000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    'Create Order Bread',
    'EACH',
    1.000,
    true,
    true
  ),
  (
    'c4000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000001',
    'Create Order Pastry',
    'KG',
    0.250,
    true,
    true
  );

-- ---------------------------------------------------------------------------
-- Function contract and privileged boundary
-- ---------------------------------------------------------------------------

select ok(
  to_regprocedure(
    'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
  ) is not null,
  'create_order(uuid, timestamptz, text, uuid, jsonb) exists'
);

select is(
  (
    select proc.prosecdef
    from pg_catalog.pg_proc as proc
    where proc.oid = to_regprocedure(
      'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
    )
  ),
  true,
  'create_order is SECURITY DEFINER'
);

select ok(
  (
    select coalesce(
      proc.proconfig @> array['search_path=""']::text[],
      false
    )
    from pg_catalog.pg_proc as proc
    where proc.oid = to_regprocedure(
      'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
    )
  ),
  'create_order uses an empty search_path'
);

select ok(
  (
    select pg_catalog.pg_get_userbyid(proc.proowner)
      not in ('anon', 'authenticated')
    from pg_catalog.pg_proc as proc
    where proc.oid = to_regprocedure(
      'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
    )
  ),
  'create_order is owned by a trusted database role'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        proc.proacl,
        pg_catalog.acldefault('f', proc.proowner)
      )
    ) as acl
    where proc.oid = to_regprocedure(
      'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot EXECUTE create_order'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        proc.proacl,
        pg_catalog.acldefault('f', proc.proowner)
      )
    ) as acl
    join pg_catalog.pg_roles as role
      on role.oid = acl.grantee
    where proc.oid = to_regprocedure(
      'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
    )
      and role.rolname = 'anon'
      and acl.privilege_type = 'EXECUTE'
  ),
  'anon cannot EXECUTE create_order'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        proc.proacl,
        pg_catalog.acldefault('f', proc.proowner)
      )
    ) as acl
    join pg_catalog.pg_roles as role
      on role.oid = acl.grantee
    where proc.oid = to_regprocedure(
      'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
    )
      and role.rolname = 'authenticated'
      and acl.privilege_type = 'EXECUTE'
  ),
  'authenticated can EXECUTE create_order'
);

select is(
  (
    select pg_catalog.pg_get_function_result(proc.oid)
    from pg_catalog.pg_proc as proc
    where proc.oid = to_regprocedure(
      'public.create_order(uuid,timestamptz,text,uuid,jsonb)'
    )
  ),
  'uuid',
  'create_order returns the persisted Order id'
);

-- ---------------------------------------------------------------------------
-- Successful CUSTOMER creation
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"c0000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select ok(
  public.create_order(
    'c1000000-0000-4000-8000-000000000001',
    '2026-10-13 09:30:00+00',
    'Leave at the receiving door.',
    'c5000000-0000-4000-8000-000000000001',
    '[
      {
        "product_id": "c4000000-0000-4000-8000-000000000001",
        "requested_quantity": 2
      },
      {
        "product_id": "c4000000-0000-4000-8000-000000000002",
        "requested_quantity": 1.500
      }
    ]'::jsonb
  ) is not null,
  'authorized CUSTOMER can create an Order'
);

reset role;

-- ---------------------------------------------------------------------------
-- Persisted Order
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::int
    from public.orders
    where created_by_user_id =
      'c0000000-0000-4000-8000-000000000001'
      and idempotency_key =
      'c5000000-0000-4000-8000-000000000001'
  ),
  1,
  'create_order persists exactly one Order'
);

select results_eq(
  $$
    select
      business_id,
      created_by_user_id,
      status::text,
      requested_delivery_at,
      delivery_address_snapshot,
      customer_notes,
      idempotency_key
    from public.orders
    where idempotency_key =
      'c5000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'RECEIVED'::text,
      '2026-10-13 09:30:00+00'::timestamptz,
      '12 Test Bakery Street'::text,
      'Leave at the receiving door.'::text,
      'c5000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'create_order derives trusted Order state and Business address snapshot'
);

-- ---------------------------------------------------------------------------
-- Persisted OrderItems
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::int
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.idempotency_key =
      'c5000000-0000-4000-8000-000000000001'
  ),
  2,
  'create_order persists every submitted OrderItem'
);

select results_eq(
  $$
    select
      item.product_id,
      item.product_name_snapshot,
      item.unit_code_snapshot,
      item.quantity_step_snapshot,
      item.requested_quantity,
      item.prepared_quantity,
      item.unavailable_quantity
    from public.order_items as item
    join public.orders as ord
      on ord.id = item.order_id
    where ord.idempotency_key =
      'c5000000-0000-4000-8000-000000000001'
    order by item.product_id
  $$,
  $$
    values
      (
        'c4000000-0000-4000-8000-000000000001'::uuid,
        'Create Order Bread'::text,
        'EACH'::text,
        1.000::numeric,
        2.000::numeric,
        0.000::numeric,
        0.000::numeric
      ),
      (
        'c4000000-0000-4000-8000-000000000002'::uuid,
        'Create Order Pastry'::text,
        'KG'::text,
        0.250::numeric,
        1.500::numeric,
        0.000::numeric,
        0.000::numeric
      )
  $$,
  'create_order snapshots trusted Product data and requested quantities'
);

-- ---------------------------------------------------------------------------
-- Initial audit event
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::int
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.idempotency_key =
      'c5000000-0000-4000-8000-000000000001'
  ),
  1,
  'create_order persists exactly one initial audit event'
);

select results_eq(
  $$
    select
      event.event_type,
      event.order_item_id,
      event.actor_user_id,
      event.reason,
      event.previous_value,
      event.new_value
    from public.order_events as event
    join public.orders as ord
      on ord.id = event.order_id
    where ord.idempotency_key =
      'c5000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'ORDER_CREATED'::text,
      null::uuid,
      'c0000000-0000-4000-8000-000000000001'::uuid,
      null::text,
      null::jsonb,
      null::jsonb
    )
  $$,
  'create_order creates ORDER_CREATED with the trusted authenticated actor'
);

select * from finish();

rollback;