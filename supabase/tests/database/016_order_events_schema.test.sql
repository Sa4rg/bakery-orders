-- M3-003A OrderEvent foundation: audit identity, relationships and payload fields.

begin;

select plan(35);

select has_table(
  'public',
  'order_events',
  'public.order_events exists'
);

select has_column('public', 'order_events', 'id', 'order_events.id exists');
select has_column('public', 'order_events', 'order_id', 'order_events.order_id exists');
select has_column('public', 'order_events', 'order_item_id', 'order_events.order_item_id exists');
select has_column('public', 'order_events', 'actor_user_id', 'order_events.actor_user_id exists');
select has_column('public', 'order_events', 'event_type', 'order_events.event_type exists');
select has_column('public', 'order_events', 'reason', 'order_events.reason exists');
select has_column('public', 'order_events', 'previous_value', 'order_events.previous_value exists');
select has_column('public', 'order_events', 'new_value', 'order_events.new_value exists');
select has_column('public', 'order_events', 'metadata', 'order_events.metadata exists');
select has_column('public', 'order_events', 'occurred_at', 'order_events.occurred_at exists');

select has_pk(
  'public',
  'order_events',
  'order_events has a primary key'
);

select col_type_is(
  'public',
  'order_events',
  'id',
  'uuid',
  'order_events.id uses uuid'
);

select col_type_is(
  'public',
  'order_events',
  'order_id',
  'uuid',
  'order_events.order_id uses uuid'
);

select col_type_is(
  'public',
  'order_events',
  'order_item_id',
  'uuid',
  'order_events.order_item_id uses uuid'
);

select col_type_is(
  'public',
  'order_events',
  'actor_user_id',
  'uuid',
  'order_events.actor_user_id uses uuid'
);

select col_type_is(
  'public',
  'order_events',
  'event_type',
  'text',
  'order_events.event_type uses text'
);

select col_type_is(
  'public',
  'order_events',
  'reason',
  'text',
  'order_events.reason uses text'
);

select col_type_is(
  'public',
  'order_events',
  'previous_value',
  'jsonb',
  'order_events.previous_value uses jsonb'
);

select col_type_is(
  'public',
  'order_events',
  'new_value',
  'jsonb',
  'order_events.new_value uses jsonb'
);

select col_type_is(
  'public',
  'order_events',
  'metadata',
  'jsonb',
  'order_events.metadata uses jsonb'
);

select col_type_is(
  'public',
  'order_events',
  'occurred_at',
  'timestamp with time zone',
  'order_events.occurred_at uses timestamptz'
);

select col_not_null(
  'public',
  'order_events',
  'id',
  'order_events.id is NOT NULL'
);

select col_not_null(
  'public',
  'order_events',
  'order_id',
  'order_events.order_id is NOT NULL'
);

select col_not_null(
  'public',
  'order_events',
  'event_type',
  'order_events.event_type is NOT NULL'
);

select col_not_null(
  'public',
  'order_events',
  'metadata',
  'order_events.metadata is NOT NULL'
);

select col_not_null(
  'public',
  'order_events',
  'occurred_at',
  'order_events.occurred_at is NOT NULL'
);

select col_is_null(
  'public',
  'order_events',
  'order_item_id',
  'order_events.order_item_id is nullable'
);

select col_is_null(
  'public',
  'order_events',
  'actor_user_id',
  'order_events.actor_user_id is nullable'
);

select col_is_null(
  'public',
  'order_events',
  'reason',
  'order_events.reason is nullable'
);

select col_is_null(
  'public',
  'order_events',
  'previous_value',
  'order_events.previous_value is nullable'
);

select col_is_null(
  'public',
  'order_events',
  'new_value',
  'order_events.new_value is nullable'
);

select fk_ok(
  'public',
  'order_events',
  'order_id',
  'public',
  'orders',
  'id',
  'order_events.order_id references orders.id'
);

select fk_ok(
  'public',
  'order_events',
  'order_item_id',
  'public',
  'order_items',
  'id',
  'order_events.order_item_id references order_items.id'
);

select fk_ok(
  'public',
  'order_events',
  'actor_user_id',
  'public',
  'profiles',
  'id',
  'order_events.actor_user_id references profiles.id'
);

select * from finish();

rollback;