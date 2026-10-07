-- M2-002 product schema: fields, exact quantities, relationships and constraints.

begin;

select plan(58);

select has_table('public', 'products', 'public.products exists');

select has_column('public', 'products', 'id', 'products.id exists');
select has_column('public', 'products', 'category_id', 'products.category_id exists');
select has_column('public', 'products', 'name', 'products.name exists');
select has_column('public', 'products', 'description', 'products.description exists');
select has_column('public', 'products', 'unit_code', 'products.unit_code exists');
select has_column('public', 'products', 'quantity_step', 'products.quantity_step exists');
select has_column('public', 'products', 'image_path', 'products.image_path exists');
select has_column('public', 'products', 'active', 'products.active exists');
select has_column('public', 'products', 'available', 'products.available exists');
select has_column('public', 'products', 'availability_updated_at', 'products.availability_updated_at exists');
select has_column('public', 'products', 'availability_updated_by', 'products.availability_updated_by exists');
select has_column('public', 'products', 'created_at', 'products.created_at exists');
select has_column('public', 'products', 'updated_at', 'products.updated_at exists');

select col_type_is('public', 'products', 'id', 'uuid', 'products.id uses uuid');
select col_type_is('public', 'products', 'category_id', 'uuid', 'products.category_id uses uuid');
select col_type_is('public', 'products', 'name', 'text', 'products.name uses text');
select col_type_is('public', 'products', 'description', 'text', 'products.description uses text');
select col_type_is('public', 'products', 'unit_code', 'text', 'products.unit_code uses text');
select col_type_is('public', 'products', 'quantity_step', 'numeric(12,3)', 'products.quantity_step uses numeric(12,3)');
select col_type_is('public', 'products', 'image_path', 'text', 'products.image_path uses text');
select col_type_is('public', 'products', 'active', 'boolean', 'products.active uses boolean');
select col_type_is('public', 'products', 'available', 'boolean', 'products.available uses boolean');
select col_type_is('public', 'products', 'availability_updated_at', 'timestamp with time zone', 'availability_updated_at uses timestamptz');
select col_type_is('public', 'products', 'availability_updated_by', 'uuid', 'availability_updated_by uses uuid');
select col_type_is('public', 'products', 'created_at', 'timestamp with time zone', 'created_at uses timestamptz');
select col_type_is('public', 'products', 'updated_at', 'timestamp with time zone', 'updated_at uses timestamptz');

select col_is_pk('public', 'products', 'id', 'products.id is the primary key');
select col_has_default('public', 'products', 'id', 'products.id has a UUID default');
select col_has_default('public', 'products', 'created_at', 'products.created_at has a default');
select col_has_default('public', 'products', 'updated_at', 'products.updated_at has a default');

select col_not_null('public', 'products', 'id', 'products.id is NOT NULL');
select col_not_null('public', 'products', 'category_id', 'products.category_id is NOT NULL');
select col_not_null('public', 'products', 'name', 'products.name is NOT NULL');
select col_not_null('public', 'products', 'unit_code', 'products.unit_code is NOT NULL');
select col_not_null('public', 'products', 'quantity_step', 'products.quantity_step is NOT NULL');
select col_not_null('public', 'products', 'active', 'products.active is NOT NULL');
select col_not_null('public', 'products', 'available', 'products.available is NOT NULL');
select col_not_null('public', 'products', 'created_at', 'products.created_at is NOT NULL');
select col_not_null('public', 'products', 'updated_at', 'products.updated_at is NOT NULL');

select col_is_null('public', 'products', 'description', 'products.description is nullable');
select col_is_null('public', 'products', 'image_path', 'products.image_path is nullable');
select col_is_null('public', 'products', 'availability_updated_at', 'availability_updated_at is nullable');
select col_is_null('public', 'products', 'availability_updated_by', 'availability_updated_by is nullable');

select is(
  (select count(*)::int from pg_attrdef d where d.adrelid = 'public.products'::regclass and d.adnum = (select attnum from pg_attribute where attrelid = 'public.products'::regclass and attname = 'active')),
  0,
  'products.active has no invented default'
);
select is(
  (select count(*)::int from pg_attrdef d where d.adrelid = 'public.products'::regclass and d.adnum = (select attnum from pg_attribute where attrelid = 'public.products'::regclass and attname = 'available')),
  0,
  'products.available has no invented default'
);

insert into auth.users (id, aud, role, email)
values ('60000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'products-schema-author@example.test');

insert into public.profiles (id, display_name, role)
values ('60000000-0000-4000-8000-000000000001', 'Product Schema Author', 'KITCHEN');

insert into public.categories (id, name)
values ('60000000-0000-4000-8000-000000000002', 'Product Schema Category');

insert into public.products (
  category_id, name, unit_code, quantity_step, active, available,
  availability_updated_at, availability_updated_by
)
values (
  '60000000-0000-4000-8000-000000000002', 'Decimal Product', 'TRAY', 0.125, true, false,
  now(), '60000000-0000-4000-8000-000000000001'
);

select matches(
  (select id::text from public.products where name = 'Decimal Product'),
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'products.id is generated as a UUID when omitted'
);

select fk_ok('public', 'products', 'category_id', 'public', 'categories', 'id', 'products.category_id references categories.id');
select fk_ok('public', 'products', 'availability_updated_by', 'public', 'profiles', 'id', 'products.availability_updated_by references profiles.id');

select throws_ok(
  $$delete from public.categories where id = '60000000-0000-4000-8000-000000000002'$$,
  '23503', null,
  'a Category referenced by a Product cannot be deleted'
);
select throws_ok(
  $$delete from public.profiles where id = '60000000-0000-4000-8000-000000000001'$$,
  '23503', null,
  'a Profile referenced by availability metadata cannot be deleted'
);

select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('60000000-0000-4000-8000-000000000002', E' \t\r\n ', 'EACH', 1, true, true)$$,
  '23514', null,
  'products rejects a blank name after trimming spaces, tabs, CR and LF'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('60000000-0000-4000-8000-000000000002', 'Blank Unit', E' \t\r\n ', 1, true, true)$$,
  '23514', null,
  'products rejects a blank unit_code after trimming spaces, tabs, CR and LF'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('60000000-0000-4000-8000-000000000002', 'Zero Step', 'EACH', 0, true, true)$$,
  '23514', null,
  'products rejects quantity_step equal to zero'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('60000000-0000-4000-8000-000000000002', 'Negative Step', 'EACH', -0.125, true, true)$$,
  '23514', null,
  'products rejects a negative quantity_step'
);

select is(
  (select quantity_step from public.products where name = 'Decimal Product'),
  0.125::numeric,
  'products accepts a valid decimal quantity_step'
);

select lives_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('60000000-0000-4000-8000-000000000002', 'Decimal Product', 'BOX', 1, true, true)$$,
  'duplicate Product names are allowed'
);

select has_index(
  'public', 'products', 'products_category_id_idx', array['category_id']::name[],
  'products_category_id_idx supports category filtering'
);

select * from finish();

rollback;
