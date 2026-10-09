-- M3-001A order foundation: lifecycle enum and orders table.

begin;

select plan(78);

select has_enum(
  'public',
  'order_status',
  'public.order_status exists'
);

select enum_has_labels(
  'public',
  'order_status',
  array[
    'RECEIVED',
    'IN_PROGRESS',
    'READY',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED'
  ],
  'order_status contains exactly the approved lifecycle states'
);

select has_table(
  'public',
  'orders',
  'public.orders exists'
);

select has_column('public', 'orders', 'order_number', 'orders.order_number exists');
select has_column('public', 'orders', 'business_id', 'orders.business_id exists');
select has_column('public', 'orders', 'created_by_user_id', 'orders.created_by_user_id exists');
select has_column('public', 'orders', 'requested_delivery_at', 'orders.requested_delivery_at exists');
select has_column('public', 'orders', 'delivery_address_snapshot', 'orders.delivery_address_snapshot exists');
select has_column('public', 'orders', 'customer_notes', 'orders.customer_notes exists');
select has_column('public', 'orders', 'idempotency_key', 'orders.idempotency_key exists');
select has_column('public', 'orders', 'created_at', 'orders.created_at exists');
select has_column('public', 'orders', 'updated_at', 'orders.updated_at exists');

select col_type_is(
  'public',
  'orders',
  'order_number',
  'bigint',
  'orders.order_number uses bigint'
);

select col_type_is(
  'public',
  'orders',
  'business_id',
  'uuid',
  'orders.business_id uses uuid'
);

select col_type_is(
  'public',
  'orders',
  'created_by_user_id',
  'uuid',
  'orders.created_by_user_id uses uuid'
);

select col_type_is(
  'public',
  'orders',
  'requested_delivery_at',
  'timestamp with time zone',
  'orders.requested_delivery_at uses timestamptz'
);

select col_type_is(
  'public',
  'orders',
  'idempotency_key',
  'uuid',
  'orders.idempotency_key uses uuid'
);

select col_not_null(
  'public',
  'orders',
  'order_number',
  'orders.order_number is NOT NULL'
);

select col_not_null(
  'public',
  'orders',
  'business_id',
  'orders.business_id is NOT NULL'
);

select col_not_null(
  'public',
  'orders',
  'created_by_user_id',
  'orders.created_by_user_id is NOT NULL'
);

select col_not_null(
  'public',
  'orders',
  'requested_delivery_at',
  'orders.requested_delivery_at is NOT NULL'
);

select col_not_null(
  'public',
  'orders',
  'idempotency_key',
  'orders.idempotency_key is NOT NULL'
);

select col_not_null(
  'public',
  'orders',
  'created_at',
  'orders.created_at is NOT NULL'
);

select col_not_null(
  'public',
  'orders',
  'updated_at',
  'orders.updated_at is NOT NULL'
);

select col_is_null(
  'public',
  'orders',
  'delivery_address_snapshot',
  'orders.delivery_address_snapshot is nullable'
);

select col_is_null(
  'public',
  'orders',
  'customer_notes',
  'orders.customer_notes is nullable'
);

select col_has_default(
  'public',
  'orders',
  'order_number',
  'orders.order_number is database-generated'
);

select fk_ok(
  'public',
  'orders',
  'business_id',
  'public',
  'businesses',
  'id',
  'orders.business_id references businesses.id'
);

select fk_ok(
  'public',
  'orders',
  'created_by_user_id',
  'public',
  'profiles',
  'id',
  'orders.created_by_user_id references profiles.id'
);

select col_is_unique(
  'public',
  'orders',
  'order_number',
  'orders.order_number is unique'
);

select col_is_unique(
  'public',
  'orders',
  array['created_by_user_id', 'idempotency_key'],
  'orders is unique per creator and idempotency key'
);

insert into auth.users (id, aud, role, email)
values (
  '80000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'orders-schema-customer@example.test'
);

insert into public.profiles (id, display_name, role)
values (
  '80000000-0000-4000-8000-000000000001',
  'Orders Schema Customer',
  'CUSTOMER'
);

insert into public.businesses (id, name)
values (
  '81000000-0000-4000-8000-000000000001',
  'Orders Schema Business'
);

insert into public.orders (
  order_number,
  business_id,
  created_by_user_id,
  status,
  requested_delivery_at,
  idempotency_key
)
values (
  9001,
  '81000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'RECEIVED',
  '2026-10-10 09:00:00+00',
  '82000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$insert into public.orders (
      order_number,
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key
    )
    values (
      9001,
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'RECEIVED',
      '2026-10-10 10:00:00+00',
      '82000000-0000-4000-8000-000000000002'
    )$$,
  '23505',
  null,
  'duplicate order_number is rejected'
);

select throws_ok(
  $$insert into public.orders (
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key
    )
    values (
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'RECEIVED',
      '2026-10-10 10:00:00+00',
      '82000000-0000-4000-8000-000000000001'
    )$$,
  '23505',
  null,
  'duplicate idempotency key for the same creator is rejected'
);

select throws_ok(
  $$delete from public.businesses
    where id = '81000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'a Business referenced by an Order cannot be deleted'
);

select throws_ok(
  $$delete from public.profiles
    where id = '80000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'a Profile referenced by an Order cannot be deleted'
);

select has_column('public', 'orders', 'started_at', 'orders.started_at exists');
select has_column('public', 'orders', 'started_by_user_id', 'orders.started_by_user_id exists');
select has_column('public', 'orders', 'ready_at', 'orders.ready_at exists');
select has_column('public', 'orders', 'ready_by_user_id', 'orders.ready_by_user_id exists');
select has_column('public', 'orders', 'dispatched_at', 'orders.dispatched_at exists');
select has_column('public', 'orders', 'dispatched_by_user_id', 'orders.dispatched_by_user_id exists');
select has_column('public', 'orders', 'delivered_at', 'orders.delivered_at exists');
select has_column('public', 'orders', 'delivered_by_user_id', 'orders.delivered_by_user_id exists');
select has_column('public', 'orders', 'cancelled_at', 'orders.cancelled_at exists');
select has_column('public', 'orders', 'cancelled_by_user_id', 'orders.cancelled_by_user_id exists');
select has_column('public', 'orders', 'cancellation_reason', 'orders.cancellation_reason exists');

select col_type_is(
  'public',
  'orders',
  'started_at',
  'timestamp with time zone',
  'orders.started_at uses timestamptz'
);

select col_type_is(
  'public',
  'orders',
  'started_by_user_id',
  'uuid',
  'orders.started_by_user_id uses uuid'
);

select col_type_is(
  'public',
  'orders',
  'ready_at',
  'timestamp with time zone',
  'orders.ready_at uses timestamptz'
);

select col_type_is(
  'public',
  'orders',
  'ready_by_user_id',
  'uuid',
  'orders.ready_by_user_id uses uuid'
);

select col_type_is(
  'public',
  'orders',
  'dispatched_at',
  'timestamp with time zone',
  'orders.dispatched_at uses timestamptz'
);

select col_type_is(
  'public',
  'orders',
  'dispatched_by_user_id',
  'uuid',
  'orders.dispatched_by_user_id uses uuid'
);

select col_type_is(
  'public',
  'orders',
  'delivered_at',
  'timestamp with time zone',
  'orders.delivered_at uses timestamptz'
);

select col_type_is(
  'public',
  'orders',
  'delivered_by_user_id',
  'uuid',
  'orders.delivered_by_user_id uses uuid'
);

select col_type_is(
  'public',
  'orders',
  'cancelled_at',
  'timestamp with time zone',
  'orders.cancelled_at uses timestamptz'
);

select col_type_is(
  'public',
  'orders',
  'cancelled_by_user_id',
  'uuid',
  'orders.cancelled_by_user_id uses uuid'
);

select col_type_is(
  'public',
  'orders',
  'cancellation_reason',
  'text',
  'orders.cancellation_reason uses text'
);

select col_is_null('public', 'orders', 'started_at', 'orders.started_at is nullable');
select col_is_null('public', 'orders', 'started_by_user_id', 'orders.started_by_user_id is nullable');
select col_is_null('public', 'orders', 'ready_at', 'orders.ready_at is nullable');
select col_is_null('public', 'orders', 'ready_by_user_id', 'orders.ready_by_user_id is nullable');
select col_is_null('public', 'orders', 'dispatched_at', 'orders.dispatched_at is nullable');
select col_is_null('public', 'orders', 'dispatched_by_user_id', 'orders.dispatched_by_user_id is nullable');
select col_is_null('public', 'orders', 'delivered_at', 'orders.delivered_at is nullable');
select col_is_null('public', 'orders', 'delivered_by_user_id', 'orders.delivered_by_user_id is nullable');
select col_is_null('public', 'orders', 'cancelled_at', 'orders.cancelled_at is nullable');
select col_is_null('public', 'orders', 'cancelled_by_user_id', 'orders.cancelled_by_user_id is nullable');
select col_is_null('public', 'orders', 'cancellation_reason', 'orders.cancellation_reason is nullable');

select fk_ok(
  'public',
  'orders',
  'started_by_user_id',
  'public',
  'profiles',
  'id',
  'orders.started_by_user_id references profiles.id'
);

select fk_ok(
  'public',
  'orders',
  'ready_by_user_id',
  'public',
  'profiles',
  'id',
  'orders.ready_by_user_id references profiles.id'
);

select fk_ok(
  'public',
  'orders',
  'dispatched_by_user_id',
  'public',
  'profiles',
  'id',
  'orders.dispatched_by_user_id references profiles.id'
);

select fk_ok(
  'public',
  'orders',
  'delivered_by_user_id',
  'public',
  'profiles',
  'id',
  'orders.delivered_by_user_id references profiles.id'
);

select fk_ok(
  'public',
  'orders',
  'cancelled_by_user_id',
  'public',
  'profiles',
  'id',
  'orders.cancelled_by_user_id references profiles.id'
);

select lives_ok(
  $$insert into public.orders (
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key,
      cancelled_at,
      cancelled_by_user_id,
      cancellation_reason
    )
    values (
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'CANCELLED',
      '2026-10-10 11:00:00+00',
      '82000000-0000-4000-8000-000000000010',
      '2026-10-09 14:00:00+00',
      '80000000-0000-4000-8000-000000000001',
      'Customer requested cancellation'
    )$$,
  'a CANCELLED Order accepts complete cancellation metadata'
);

select throws_ok(
  $$insert into public.orders (
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key,
      cancelled_by_user_id,
      cancellation_reason
    )
    values (
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'CANCELLED',
      '2026-10-10 11:00:00+00',
      '82000000-0000-4000-8000-000000000011',
      '80000000-0000-4000-8000-000000000001',
      'Missing cancellation timestamp'
    )$$,
  '23514',
  null,
  'CANCELLED Order requires cancelled_at'
);

select throws_ok(
  $$insert into public.orders (
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key,
      cancelled_at,
      cancellation_reason
    )
    values (
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'CANCELLED',
      '2026-10-10 11:00:00+00',
      '82000000-0000-4000-8000-000000000012',
      '2026-10-09 14:00:00+00',
      'Missing cancellation actor'
    )$$,
  '23514',
  null,
  'CANCELLED Order requires cancelled_by_user_id'
);

select throws_ok(
  $$insert into public.orders (
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key,
      cancelled_at,
      cancelled_by_user_id,
      cancellation_reason
    )
    values (
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'CANCELLED',
      '2026-10-10 11:00:00+00',
      '82000000-0000-4000-8000-000000000013',
      '2026-10-09 14:00:00+00',
      '80000000-0000-4000-8000-000000000001',
      E' \t\r\n '
    )$$,
  '23514',
  null,
  'CANCELLED Order rejects a blank cancellation reason'
);

select throws_ok(
  $$insert into public.orders (
      business_id,
      created_by_user_id,
      status,
      requested_delivery_at,
      idempotency_key,
      cancelled_at,
      cancelled_by_user_id,
      cancellation_reason
    )
    values (
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      'RECEIVED',
      '2026-10-10 11:00:00+00',
      '82000000-0000-4000-8000-000000000014',
      '2026-10-09 14:00:00+00',
      '80000000-0000-4000-8000-000000000001',
      'Cancellation metadata on a live Order'
    )$$,
  '23514',
  null,
  'a non-CANCELLED Order cannot carry cancellation metadata'
);

select * from finish();

rollback;