-- M3-010 adversarial authorization and lifecycle tests for CUSTOMER cancellation.

begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

insert into auth.users (
  id,
  aud,
  role,
  email
)
values
  (
    '91100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'cancel-a@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'cancel-a2@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'cancel-b@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'cancel-inactive-membership@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'cancel-inactive-profile@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'cancel-inactive-business@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000007',
    'authenticated',
    'authenticated',
    'cancel-kitchen@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000008',
    'authenticated',
    'authenticated',
    'cancel-manager@example.test'
  ),
  (
    '91100000-0000-4000-8000-000000000009',
    'authenticated',
    'authenticated',
    'cancel-no-profile@example.test'
  );

insert into public.profiles (
  id,
  display_name,
  role,
  active
)
values
  (
    '91100000-0000-4000-8000-000000000001',
    'Cancellation Customer A',
    'CUSTOMER',
    true
  ),
  (
    '91100000-0000-4000-8000-000000000002',
    'Cancellation Customer A2',
    'CUSTOMER',
    true
  ),
  (
    '91100000-0000-4000-8000-000000000003',
    'Cancellation Customer B',
    'CUSTOMER',
    true
  ),
  (
    '91100000-0000-4000-8000-000000000004',
    'Inactive Membership Customer',
    'CUSTOMER',
    true
  ),
  (
    '91100000-0000-4000-8000-000000000005',
    'Inactive Cancellation Customer',
    'CUSTOMER',
    false
  ),
  (
    '91100000-0000-4000-8000-000000000006',
    'Inactive Business Customer',
    'CUSTOMER',
    true
  ),
  (
    '91100000-0000-4000-8000-000000000007',
    'Cancellation Kitchen',
    'KITCHEN',
    true
  ),
  (
    '91100000-0000-4000-8000-000000000008',
    'Cancellation Manager',
    'MANAGER',
    true
  );

-- ---------------------------------------------------------------------------
-- Businesses / memberships
-- ---------------------------------------------------------------------------

insert into public.businesses (
  id,
  name,
  active
)
values
  (
    '92100000-0000-4000-8000-000000000001',
    'Cancellation Business A',
    true
  ),
  (
    '92100000-0000-4000-8000-000000000002',
    'Cancellation Business B',
    true
  ),
  (
    '92100000-0000-4000-8000-000000000003',
    'Historical Inactive Business',
    false
  );

insert into public.business_memberships (
  id,
  user_id,
  business_id,
  active
)
values
  (
    '93100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    '92100000-0000-4000-8000-000000000001',
    true
  ),
  (
    '93100000-0000-4000-8000-000000000002',
    '91100000-0000-4000-8000-000000000002',
    '92100000-0000-4000-8000-000000000001',
    true
  ),
  (
    '93100000-0000-4000-8000-000000000003',
    '91100000-0000-4000-8000-000000000003',
    '92100000-0000-4000-8000-000000000002',
    true
  ),
  (
    '93100000-0000-4000-8000-000000000004',
    '91100000-0000-4000-8000-000000000004',
    '92100000-0000-4000-8000-000000000001',
    false
  ),
  (
    '93100000-0000-4000-8000-000000000005',
    '91100000-0000-4000-8000-000000000005',
    '92100000-0000-4000-8000-000000000001',
    true
  ),
  (
    '93100000-0000-4000-8000-000000000006',
    '91100000-0000-4000-8000-000000000006',
    '92100000-0000-4000-8000-000000000003',
    true
  );

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

insert into public.orders (
  id,
  business_id,
  created_by_user_id,
  status,
  requested_delivery_at,
  idempotency_key
)
values
  (
    '94100000-0000-4000-8000-000000000001',
    '92100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'RECEIVED',
    '2026-10-20T10:00:00Z',
    '95100000-0000-4000-8000-000000000001'
  ),
  (
    '94100000-0000-4000-8000-000000000002',
    '92100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'RECEIVED',
    '2026-10-20T11:00:00Z',
    '95100000-0000-4000-8000-000000000002'
  ),
  (
    '94100000-0000-4000-8000-000000000003',
    '92100000-0000-4000-8000-000000000002',
    '91100000-0000-4000-8000-000000000003',
    'RECEIVED',
    '2026-10-20T12:00:00Z',
    '95100000-0000-4000-8000-000000000003'
  ),
  (
    '94100000-0000-4000-8000-000000000004',
    '92100000-0000-4000-8000-000000000003',
    '91100000-0000-4000-8000-000000000006',
    'RECEIVED',
    '2026-10-20T13:00:00Z',
    '95100000-0000-4000-8000-000000000004'
  );

-- This lifecycle fixture represents an Order whose preparation already started.

insert into public.orders (
  id,
  business_id,
  created_by_user_id,
  status,
  requested_delivery_at,
  idempotency_key,
  started_at,
  started_by_user_id
)
values (
  '94100000-0000-4000-8000-000000000005',
  '92100000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000001',
  'IN_PROGRESS',
  '2026-10-20T14:00:00Z',
  '95100000-0000-4000-8000-000000000005',
  '2026-10-19T08:00:00Z',
  '91100000-0000-4000-8000-000000000007'
);

-- ---------------------------------------------------------------------------
-- Null input
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      null,
      'Valid reason'
    )
  $$,
  '22023',
  null,
  'null Order id is rejected'
);

reset role;

-- ---------------------------------------------------------------------------
-- Identity without Profile
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000009"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000001',
      'Valid reason'
    )
  $$,
  '42501',
  null,
  'identity without Profile cannot cancel an Order'
);

reset role;

-- ---------------------------------------------------------------------------
-- Inactive Profile
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000005"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000001',
      'Valid reason'
    )
  $$,
  '42501',
  null,
  'inactive CUSTOMER Profile cannot cancel an Order'
);

reset role;

-- ---------------------------------------------------------------------------
-- Inactive membership
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000004"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000001',
      'Valid reason'
    )
  $$,
  '42501',
  null,
  'inactive membership cannot authorize cancellation'
);

reset role;

-- ---------------------------------------------------------------------------
-- Wrong roles
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000007"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000001',
      'Kitchen cancellation attempt'
    )
  $$,
  '42501',
  null,
  'KITCHEN cannot use the CUSTOMER cancellation command'
);

reset role;

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000008"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000001',
      'Manager cancellation attempt'
    )
  $$,
  '42501',
  null,
  'MANAGER does not gain CUSTOMER cancellation semantics'
);

reset role;

-- ---------------------------------------------------------------------------
-- Cross-business isolation
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000003"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000001',
      'Cross-business attempt'
    )
  $$,
  '42501',
  null,
  'CUSTOMER B cannot cancel Business A Order'
);

reset role;

select is(
  (
    select status::text
    from public.orders
    where id =
      '94100000-0000-4000-8000-000000000001'
  ),
  'RECEIVED',
  'cross-business attempt leaves target Order unchanged'
);

select is(
  (
    select count(*)::int
    from public.order_events
    where order_id =
      '94100000-0000-4000-8000-000000000001'
      and event_type = 'ORDER_CANCELLED'
  ),
  0,
  'cross-business attempt creates no audit event'
);

-- ---------------------------------------------------------------------------
-- Unknown identifier receives same authorization class
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94999999-9999-4999-8999-999999999999',
      'Unknown Order'
    )
  $$,
  '42501',
  null,
  'unknown Order does not disclose existence details'
);

-- ---------------------------------------------------------------------------
-- Invalid lifecycle
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000005',
      'Too late'
    )
  $$,
  '22023',
  null,
  'CUSTOMER cannot cancel after preparation started'
);

reset role;

select is(
  (
    select status::text
    from public.orders
    where id =
      '94100000-0000-4000-8000-000000000005'
  ),
  'IN_PROGRESS',
  'rejected cancellation preserves IN_PROGRESS state'
);

select is(
  (
    select count(*)::int
    from public.order_events
    where order_id =
      '94100000-0000-4000-8000-000000000005'
      and event_type = 'ORDER_CANCELLED'
  ),
  0,
  'rejected lifecycle transition creates no cancellation event'
);

-- ---------------------------------------------------------------------------
-- Same-Business coworker
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select lives_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000002',
      'Establishment requested cancellation'
    )
  $$,
  'authorized CUSTOMER coworker may cancel an Order for the same Business'
);

reset role;

select is(
  (
    select cancelled_by_user_id
    from public.orders
    where id =
      '94100000-0000-4000-8000-000000000002'
  ),
  '91100000-0000-4000-8000-000000000002'::uuid,
  'same-Business cancellation records the actual authenticated actor'
);

-- ---------------------------------------------------------------------------
-- Historical inactive Business
-- ---------------------------------------------------------------------------
--
-- Business inactivity prevents NEW order creation, but historical access is
-- intentionally preserved. An active CUSTOMER membership therefore remains
-- sufficient to cancel a still-RECEIVED historical Order.

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91100000-0000-4000-8000-000000000006"}',
    true
  );
end
$$;

select lives_ok(
  $$
    select public.cancel_customer_order(
      '94100000-0000-4000-8000-000000000004',
      'Historical Order cancellation'
    )
  $$,
  'active CUSTOMER membership may cancel RECEIVED Order after Business deactivation'
);

reset role;

select is(
  (
    select status::text
    from public.orders
    where id =
      '94100000-0000-4000-8000-000000000004'
  ),
  'CANCELLED',
  'historical inactive-Business Order becomes CANCELLED'
);

select * from finish();

rollback;