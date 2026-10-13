-- M3-002 OrderItem schema, quantity invariants and historical snapshots.

begin;

select plan(52);

select has_table(
  'public',
  'order_items',
  'public.order_items exists'
);

select has_column('public', 'order_items', 'id', 'order_items.id exists');
select has_column('public', 'order_items', 'order_id', 'order_items.order_id exists');
select has_column('public', 'order_items', 'product_id', 'order_items.product_id exists');
select has_column('public', 'order_items', 'requested_quantity', 'order_items.requested_quantity exists');
select has_column('public', 'order_items', 'prepared_quantity', 'order_items.prepared_quantity exists');
select has_column('public', 'order_items', 'unavailable_quantity', 'order_items.unavailable_quantity exists');
select has_column('public', 'order_items', 'created_at', 'order_items.created_at exists');
select has_column('public', 'order_items', 'updated_at', 'order_items.updated_at exists');

select has_pk(
  'public',
  'order_items',
  'order_items has a primary key'
);

select col_type_is(
  'public',
  'order_items',
  'id',
  'uuid',
  'order_items.id uses uuid'
);

select col_type_is(
  'public',
  'order_items',
  'order_id',
  'uuid',
  'order_items.order_id uses uuid'
);

select col_type_is(
  'public',
  'order_items',
  'product_id',
  'uuid',
  'order_items.product_id uses uuid'
);

select col_type_is(
  'public',
  'order_items',
  'requested_quantity',
  'numeric(12,3)',
  'order_items.requested_quantity uses numeric(12,3)'
);

select col_type_is(
  'public',
  'order_items',
  'prepared_quantity',
  'numeric(12,3)',
  'order_items.prepared_quantity uses numeric(12,3)'
);

select col_type_is(
  'public',
  'order_items',
  'unavailable_quantity',
  'numeric(12,3)',
  'order_items.unavailable_quantity uses numeric(12,3)'
);

select col_type_is(
  'public',
  'order_items',
  'created_at',
  'timestamp with time zone',
  'order_items.created_at uses timestamptz'
);

select col_type_is(
  'public',
  'order_items',
  'updated_at',
  'timestamp with time zone',
  'order_items.updated_at uses timestamptz'
);

select col_not_null('public', 'order_items', 'id', 'order_items.id is NOT NULL');
select col_not_null('public', 'order_items', 'order_id', 'order_items.order_id is NOT NULL');
select col_not_null('public', 'order_items', 'product_id', 'order_items.product_id is NOT NULL');
select col_not_null(
  'public',
  'order_items',
  'requested_quantity',
  'order_items.requested_quantity is NOT NULL'
);
select col_not_null(
  'public',
  'order_items',
  'prepared_quantity',
  'order_items.prepared_quantity is NOT NULL'
);
select col_not_null(
  'public',
  'order_items',
  'unavailable_quantity',
  'order_items.unavailable_quantity is NOT NULL'
);
select col_not_null('public', 'order_items', 'created_at', 'order_items.created_at is NOT NULL');
select col_not_null('public', 'order_items', 'updated_at', 'order_items.updated_at is NOT NULL');

select col_has_default(
  'public',
  'order_items',
  'prepared_quantity',
  'order_items.prepared_quantity has a default'
);

select col_has_default(
  'public',
  'order_items',
  'unavailable_quantity',
  'order_items.unavailable_quantity has a default'
);

select fk_ok(
  'public',
  'order_items',
  'order_id',
  'public',
  'orders',
  'id',
  'order_items.order_id references orders.id'
);

select fk_ok(
  'public',
  'order_items',
  'product_id',
  'public',
  'products',
  'id',
  'order_items.product_id references products.id'
);

select has_column(
  'public',
  'order_items',
  'product_name_snapshot',
  'order_items.product_name_snapshot exists'
);

select has_column(
  'public',
  'order_items',
  'unit_code_snapshot',
  'order_items.unit_code_snapshot exists'
);

select has_column(
  'public',
  'order_items',
  'quantity_step_snapshot',
  'order_items.quantity_step_snapshot exists'
);

select col_type_is(
  'public',
  'order_items',
  'product_name_snapshot',
  'text',
  'order_items.product_name_snapshot uses text'
);

select col_type_is(
  'public',
  'order_items',
  'unit_code_snapshot',
  'text',
  'order_items.unit_code_snapshot uses text'
);

select col_type_is(
  'public',
  'order_items',
  'quantity_step_snapshot',
  'numeric(12,3)',
  'order_items.quantity_step_snapshot uses numeric(12,3)'
);

select col_not_null(
  'public',
  'order_items',
  'product_name_snapshot',
  'order_items.product_name_snapshot is NOT NULL'
);

select col_not_null(
  'public',
  'order_items',
  'unit_code_snapshot',
  'order_items.unit_code_snapshot is NOT NULL'
);

select col_not_null(
  'public',
  'order_items',
  'quantity_step_snapshot',
  'order_items.quantity_step_snapshot is NOT NULL'
);

insert into auth.users (id, aud, role, email)
values (
  '88000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'order-items-schema-customer@example.test'
);

insert into public.profiles (id, display_name, role, active)
values (
  '88000000-0000-4000-8000-000000000001',
  'Order Items Schema Customer',
  'CUSTOMER',
  true
);

insert into public.businesses (id, name, active)
values (
  '89000000-0000-4000-8000-000000000001',
  'Order Items Schema Business',
  true
);

insert into public.categories (id, name, active, display_order)
values (
  '8a000000-0000-4000-8000-000000000001',
  'Order Items Schema Category',
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
  '8b000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  'Order Items Schema Product',
  'EACH',
  0.500,
  true,
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
  '8c000000-0000-4000-8000-000000000001',
  9201,
  '89000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  'RECEIVED',
  '2026-10-12 09:00:00+00',
  '8d000000-0000-4000-8000-000000000001'
);

select lives_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.500,
      2.500
    )$$,
  'positive requested quantity with zero fulfillment is valid'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.500,
      0
    )$$,
  '23514',
  null,
  'requested_quantity must be greater than zero'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity,
      prepared_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.500,
      2,
      -0.500
    )$$,
  '23514',
  null,
  'prepared_quantity cannot be negative'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity,
      unavailable_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.500,
      2,
      -0.500
    )$$,
  '23514',
  null,
  'unavailable_quantity cannot be negative'
);

select lives_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity,
      prepared_quantity,
      unavailable_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.500,
      3,
      2,
      1
    )$$,
  'prepared plus unavailable may equal requested quantity'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity,
      prepared_quantity,
      unavailable_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.500,
      3,
      2.500,
      1
    )$$,
  '23514',
  null,
  'prepared plus unavailable cannot exceed requested quantity'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      E' \t\r\n ',
      'EACH',
      0.500,
      1.000
    )$$,
  '23514',
  null,
  'product_name_snapshot cannot be blank'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      E' \t\r\n ',
      0.500,
      1.000
    )$$,
  '23514',
  null,
  'unit_code_snapshot cannot be blank'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0,
      1.000
    )$$,
  '23514',
  null,
  'quantity_step_snapshot must be greater than zero'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      -0.100,
      1.000
    )$$,
  '23514',
  null,
  'quantity_step_snapshot cannot be negative'
);

select lives_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.100,
      1.200
    )$$,
  'requested quantity may be an exact decimal multiple of quantity step'
);

select throws_ok(
  $$insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      '8c000000-0000-4000-8000-000000000001',
      '8b000000-0000-4000-8000-000000000001',
      'Order Items Schema Product',
      'EACH',
      0.100,
      1.250
    )$$,
  '23514',
  null,
  'requested quantity must be an exact multiple of quantity step'
);

insert into public.order_items (
  id,
  order_id,
  product_id,
  product_name_snapshot,
  unit_code_snapshot,
  quantity_step_snapshot,
  requested_quantity
)
values (
  '8e000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  'Order Items Schema Product',
  'EACH',
  0.500,
  1.500
);

update public.products
set
  name = 'Renamed Product',
  unit_code = 'BOX',
  quantity_step = 1.000
where id = '8b000000-0000-4000-8000-000000000001';

select results_eq(
  $$select
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot
    from public.order_items
    where id = '8e000000-0000-4000-8000-000000000001'$$,
  $$values (
      'Order Items Schema Product'::text,
      'EACH'::text,
      0.500::numeric
    )$$,
  'OrderItem snapshots remain unchanged when Product catalog data changes'
);

select * from finish();

rollback;