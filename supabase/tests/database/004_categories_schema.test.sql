-- M2-001 category schema: columns, defaults, constraints and uniqueness.

begin;

select plan(33);

select has_table('public', 'categories', 'public.categories exists');

select has_column('public', 'categories', 'id', 'categories.id exists');
select has_column('public', 'categories', 'name', 'categories.name exists');
select has_column('public', 'categories', 'description', 'categories.description exists');
select has_column('public', 'categories', 'active', 'categories.active exists');
select has_column('public', 'categories', 'display_order', 'categories.display_order exists');
select has_column('public', 'categories', 'created_at', 'categories.created_at exists');
select has_column('public', 'categories', 'updated_at', 'categories.updated_at exists');

select col_type_is('public', 'categories', 'id', 'uuid', 'categories.id uses uuid');
select col_type_is('public', 'categories', 'name', 'text', 'categories.name uses text');
select col_type_is('public', 'categories', 'description', 'text', 'categories.description uses text');
select col_type_is('public', 'categories', 'active', 'boolean', 'categories.active uses boolean');
select col_type_is('public', 'categories', 'display_order', 'integer', 'categories.display_order uses integer');
select col_type_is('public', 'categories', 'created_at', 'timestamp with time zone', 'categories.created_at uses timestamptz');
select col_type_is('public', 'categories', 'updated_at', 'timestamp with time zone', 'categories.updated_at uses timestamptz');

select col_is_pk('public', 'categories', 'id', 'categories.id is the primary key');
select col_has_default('public', 'categories', 'id', 'categories.id has a UUID default');
select col_has_default('public', 'categories', 'created_at', 'categories.created_at has a default');
select col_has_default('public', 'categories', 'updated_at', 'categories.updated_at has a default');
select col_default_is('public', 'categories', 'active', true, 'categories.active defaults to true');
select col_default_is('public', 'categories', 'display_order', 0, 'categories.display_order defaults to zero');

select col_not_null('public', 'categories', 'id', 'categories.id is NOT NULL');
select col_not_null('public', 'categories', 'name', 'categories.name is NOT NULL');
select col_is_null('public', 'categories', 'description', 'categories.description is nullable');
select col_not_null('public', 'categories', 'active', 'categories.active is NOT NULL');
select col_not_null('public', 'categories', 'display_order', 'categories.display_order is NOT NULL');
select col_not_null('public', 'categories', 'created_at', 'categories.created_at is NOT NULL');
select col_not_null('public', 'categories', 'updated_at', 'categories.updated_at is NOT NULL');

insert into public.categories (name)
values ('Generated UUID category');

select matches(
  (select id::text from public.categories where name = 'Generated UUID category'),
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'categories.id is generated as a UUID when omitted'
);

select throws_ok(
  $$insert into public.categories (name) values ('   ')$$,
  '23514', null,
  'categories rejects whitespace-only names'
);

select throws_ok(
  $$insert into public.categories (name, display_order) values ('Negative order', -1)$$,
  '23514', null,
  'categories rejects a negative display_order'
);

insert into public.categories (name) values ('Category Uniqueness Fixture');

select throws_ok(
  $$insert into public.categories (name) values ('category uniqueness fixture')$$,
  '23505', null,
  'category names are unique case-insensitively'
);

select ok(
  exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_namespace n on n.oid = idx.relnamespace
    where n.nspname = 'public'
      and idx.relname = 'categories_name_lower_uidx'
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) like '%lower(name)%'
  ),
  'categories_name_lower_uidx is a unique index on lower(name)'
);

select * from finish();

rollback;
