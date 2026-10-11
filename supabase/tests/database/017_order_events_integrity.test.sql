-- M3-003B OrderEvent integrity: trusted defaults and event vocabulary.

begin;

select plan(13);

insert into auth.users (id, aud, role, email)
values (
  'a0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'order-events-integrity@example.test'
);

insert into public.profiles (id, display_name, role, active)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Order Events Integrity Customer',
  'CUSTOMER',
  true
);

insert into public.businesses (id, name, active)
values (
  'a1000000-0000-4000-8000-000000000001',
  'Order Events Integrity Business',
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
values (
  'a2000000-0000-4000-8000-000000000001',
  9401,
  'a1000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'RECEIVED',
  '2026-10-13 09:00:00+00',
  'a3000000-0000-4000-8000-000000000001'
);

select col_has_default(
  'public',
  'order_events',
  'id',
  'order_events.id has a trusted database default'
);

select col_has_default(
  'public',
  'order_events',
  'occurred_at',
  'order_events.occurred_at has a trusted database default'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'ORDER_CREATED',
      '{}'::jsonb
    )$$,
  'ORDER_CREATED is a valid event type'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'PREPARATION_STARTED',
      '{}'::jsonb
    )$$,
  'PREPARATION_STARTED is a valid event type'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'QUANTITY_PREPARED',
      '{}'::jsonb
    )$$,
  'QUANTITY_PREPARED is a valid event type'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'QUANTITY_UNAVAILABLE',
      '{}'::jsonb
    )$$,
  'QUANTITY_UNAVAILABLE is a valid event type'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'ORDER_READY',
      '{}'::jsonb
    )$$,
  'ORDER_READY is a valid event type'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'ORDER_DISPATCHED',
      '{}'::jsonb
    )$$,
  'ORDER_DISPATCHED is a valid event type'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'ORDER_DELIVERED',
      '{}'::jsonb
    )$$,
  'ORDER_DELIVERED is a valid event type'
);

select lives_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'ORDER_CANCELLED',
      '{}'::jsonb
    )$$,
  'ORDER_CANCELLED is a valid event type'
);

select throws_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'UNKNOWN_EVENT',
      '{}'::jsonb
    )$$,
  '23514',
  null,
  'unknown event types are rejected'
);

select throws_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      '',
      '{}'::jsonb
    )$$,
  '23514',
  null,
  'blank event types are rejected'
);

select throws_ok(
  $$insert into public.order_events (order_id, event_type, metadata)
    values (
      'a2000000-0000-4000-8000-000000000001',
      'order_created',
      '{}'::jsonb
    )$$,
  '23514',
  null,
  'event type vocabulary is case-sensitive'
);

select * from finish();

rollback;