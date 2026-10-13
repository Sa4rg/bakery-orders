-- M3-003C OrderEvent RLS and append-only browser boundary.

begin;

select plan(16);

insert into auth.users (id, aud, role, email)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'order-events-customer-a@example.test'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'order-events-customer-b@example.test'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'order-events-kitchen@example.test'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'order-events-inactive-kitchen@example.test'
  ),
  (
    'b0000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'order-events-manager@example.test'
  ),
  (
    'b0000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'order-events-inactive-manager@example.test'
  );

insert into public.profiles (id, display_name, role, active)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'Order Events Customer A',
    'CUSTOMER',
    true
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'Order Events Customer B',
    'CUSTOMER',
    true
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'Order Events Kitchen',
    'KITCHEN',
    true
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'Inactive Order Events Kitchen',
    'KITCHEN',
    false
  ),
  (
    'b0000000-0000-4000-8000-000000000005',
    'Order Events Manager',
    'MANAGER',
    true
  ),
  (
    'b0000000-0000-4000-8000-000000000006',
    'Inactive Order Events Manager',
    'MANAGER',
    false
  );

insert into public.businesses (id, name, active)
values
  (
    'b1000000-0000-4000-8000-000000000001',
    'Order Events Business A',
    true
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'Order Events Business B',
    true
  );

insert into public.business_memberships (id, user_id, business_id, active)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    true
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
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
    'b3000000-0000-4000-8000-000000000001',
    9501,
    'b1000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'RECEIVED',
    '2026-10-13 09:00:00+00',
    'b4000000-0000-4000-8000-000000000001'
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    9502,
    'b1000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'RECEIVED',
    '2026-10-13 10:00:00+00',
    'b4000000-0000-4000-8000-000000000002'
  );

insert into public.order_events (
  id,
  order_id,
  actor_user_id,
  event_type,
  metadata,
  occurred_at
)
values
  (
    'b5000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'ORDER_CREATED',
    '{}'::jsonb,
    '2026-10-11 12:00:00+00'
  ),
  (
    'b5000000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'ORDER_CREATED',
    '{}'::jsonb,
    '2026-10-11 12:05:00+00'
  );

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.order_events'::regclass
  ),
  true,
  'RLS is enabled on order_events'
);

select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(
      'anon',
      'public.order_events',
      privilege_name
    )
  ),
  0,
  'anon has no OrderEvent table privileges'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.order_events',
    'SELECT'
  ),
  'authenticated receives only controlled OrderEvent read access'
);

select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'DELETE']) privilege_name
    where has_table_privilege(
      'authenticated',
      'public.order_events',
      privilege_name
    )
  ),
  0,
  'authenticated has no direct OrderEvent write privileges'
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
  $$select * from public.order_events$$,
  '42501',
  'permission denied for table order_events',
  'anon cannot read OrderEvents'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b0000000-0000-4000-8000-000000000001"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_events$$,
  'CUSTOMER has no direct audit-event visibility before a customer-safe projection is defined'
);

select throws_ok(
  $$insert into public.order_events (
      order_id,
      actor_user_id,
      event_type,
      metadata,
      occurred_at
    )
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000005',
      'ORDER_CREATED',
      '{}'::jsonb,
      '2000-01-01 00:00:00+00'
    )$$,
  '42501',
  null,
  'CUSTOMER cannot forge OrderEvent actor or timestamp'
);

select throws_ok(
  $$update public.order_events
    set event_type = 'ORDER_CANCELLED'
    where id = 'b5000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'CUSTOMER cannot rewrite OrderEvents'
);

select throws_ok(
  $$delete from public.order_events
    where id = 'b5000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'CUSTOMER cannot delete OrderEvents'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b0000000-0000-4000-8000-000000000003"}',
    true
  );
end $$;

select results_eq(
  $$select id
    from public.order_events
    order by id$$,
  $$values
      ('b5000000-0000-4000-8000-000000000001'::uuid),
      ('b5000000-0000-4000-8000-000000000002'::uuid)$$,
  'active KITCHEN reads operational OrderEvents'
);

select throws_ok(
  $$delete from public.order_events
    where id = 'b5000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'KITCHEN cannot delete historical OrderEvents'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b0000000-0000-4000-8000-000000000004"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_events$$,
  'inactive KITCHEN cannot read OrderEvents'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b0000000-0000-4000-8000-000000000005"}',
    true
  );
end $$;

select results_eq(
  $$select id
    from public.order_events
    order by id$$,
  $$values
      ('b5000000-0000-4000-8000-000000000001'::uuid),
      ('b5000000-0000-4000-8000-000000000002'::uuid)$$,
  'active MANAGER reads operational audit history'
);

select throws_ok(
  $$update public.order_events
    set metadata = '{"tampered": true}'::jsonb
    where id = 'b5000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'MANAGER cannot directly rewrite audit history'
);

reset role;
set local role authenticated;

do $$ begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"b0000000-0000-4000-8000-000000000006"}',
    true
  );
end $$;

select is_empty(
  $$select 1 from public.order_events$$,
  'inactive MANAGER cannot read OrderEvents'
);

reset role;

select results_eq(
  $$select
      event_type,
      metadata,
      occurred_at
    from public.order_events
    where id = 'b5000000-0000-4000-8000-000000000001'$$,
  $$values (
      'ORDER_CREATED'::text,
      '{}'::jsonb,
      '2026-10-11 12:00:00+00'::timestamptz
    )$$,
  'denied writes leave historical OrderEvent unchanged'
);

select * from finish();

rollback;