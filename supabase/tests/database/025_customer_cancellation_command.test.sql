-- M3-010 customer cancellation trusted command.
--
-- Proves the core successful transition:
--
-- RECEIVED
--   -> CANCELLED
--
-- with trusted actor/timestamp, mandatory reason and append-only audit.

begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (
  id,
  aud,
  role,
  email
)
values (
  '91000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'cancel-command-customer@example.test'
);

insert into public.profiles (
  id,
  display_name,
  role,
  active
)
values (
  '91000000-0000-4000-8000-000000000001',
  'Cancellation Customer',
  'CUSTOMER',
  true
);

insert into public.businesses (
  id,
  name,
  active
)
values (
  '92000000-0000-4000-8000-000000000001',
  'Cancellation Business',
  true
);

insert into public.business_memberships (
  id,
  user_id,
  business_id,
  active
)
values (
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  true
);

insert into public.orders (
  id,
  business_id,
  created_by_user_id,
  status,
  requested_delivery_at,
  idempotency_key
)
values (
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'RECEIVED',
  '2026-10-20T10:00:00Z',
  '95000000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Function/grant boundary
-- ---------------------------------------------------------------------------

select has_function(
  'public',
  'cancel_customer_order',
  array['uuid', 'text'],
  'cancel_customer_order(uuid, text) exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.cancel_customer_order(uuid,text)',
    'EXECUTE'
  ),
  'authenticated may execute cancel_customer_order'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cancel_customer_order(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute cancel_customer_order'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.orders',
    'UPDATE'
  ),
  'authenticated still cannot UPDATE orders directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.order_events',
    'INSERT'
  ),
  'authenticated still cannot forge order_events directly'
);

-- ---------------------------------------------------------------------------
-- Authenticated CUSTOMER
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94000000-0000-4000-8000-000000000001',
      null
    )
  $$,
  '22023',
  null,
  'CUSTOMER cannot cancel without a reason'
);

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94000000-0000-4000-8000-000000000001',
      '   '
    )
  $$,
  '22023',
  null,
  'CUSTOMER cannot cancel with a blank reason'
);

select lives_ok(
  $$
    select public.cancel_customer_order(
      '94000000-0000-4000-8000-000000000001',
      '  Customer requirements changed.  '
    )
  $$,
  'authorized CUSTOMER can cancel a RECEIVED Order'
);

reset role;

-- ---------------------------------------------------------------------------
-- Persisted result
-- ---------------------------------------------------------------------------

select is(
  (
    select status::text
    from public.orders
    where id =
      '94000000-0000-4000-8000-000000000001'
  ),
  'CANCELLED',
  'Order becomes CANCELLED'
);

select is(
  (
    select cancellation_reason
    from public.orders
    where id =
      '94000000-0000-4000-8000-000000000001'
  ),
  'Customer requirements changed.',
  'Cancellation reason is normalized and persisted'
);

select is(
  (
    select cancelled_by_user_id
    from public.orders
    where id =
      '94000000-0000-4000-8000-000000000001'
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'Cancellation actor comes from authenticated identity'
);

select ok(
  (
    select cancelled_at is not null
    from public.orders
    where id =
      '94000000-0000-4000-8000-000000000001'
  ),
  'Cancellation receives a trusted timestamp'
);

select is(
  (
    select count(*)::int
    from public.orders
    where id =
      '94000000-0000-4000-8000-000000000001'
  ),
  1,
  'Cancellation preserves the Order record'
);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::int
    from public.order_events
    where order_id =
      '94000000-0000-4000-8000-000000000001'
      and event_type = 'ORDER_CANCELLED'
  ),
  1,
  'Cancellation creates exactly one ORDER_CANCELLED event'
);

select is(
  (
    select actor_user_id
    from public.order_events
    where order_id =
      '94000000-0000-4000-8000-000000000001'
      and event_type = 'ORDER_CANCELLED'
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'Cancellation event records the trusted actor'
);

select is(
  (
    select reason
    from public.order_events
    where order_id =
      '94000000-0000-4000-8000-000000000001'
      and event_type = 'ORDER_CANCELLED'
  ),
  'Customer requirements changed.',
  'Cancellation event records the reason'
);

select is(
  (
    select previous_value
    from public.order_events
    where order_id =
      '94000000-0000-4000-8000-000000000001'
      and event_type = 'ORDER_CANCELLED'
  ),
  '{"status":"RECEIVED"}'::jsonb,
  'Cancellation event records previous status'
);

select is(
  (
    select new_value
    from public.order_events
    where order_id =
      '94000000-0000-4000-8000-000000000001'
      and event_type = 'ORDER_CANCELLED'
  ),
  '{"status":"CANCELLED"}'::jsonb,
  'Cancellation event records new status'
);

select ok(
  (
    select e.occurred_at = o.cancelled_at
    from public.orders o
    join public.order_events e
      on e.order_id = o.id
    where o.id =
      '94000000-0000-4000-8000-000000000001'
      and e.event_type = 'ORDER_CANCELLED'
  ),
  'Order and audit event share the same trusted cancellation timestamp'
);

-- A second cancellation is not another valid transition.

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94000000-0000-4000-8000-000000000001',
      'Second cancellation attempt'
    )
  $$,
  '22023',
  null,
  'already CANCELLED Order cannot be cancelled again'
);

reset role;

select is(
  (
    select count(*)::int
    from public.order_events
    where order_id =
      '94000000-0000-4000-8000-000000000001'
      and event_type = 'ORDER_CANCELLED'
  ),
  1,
  'failed repeated cancellation does not append another event'
);

select * from finish();

rollback;