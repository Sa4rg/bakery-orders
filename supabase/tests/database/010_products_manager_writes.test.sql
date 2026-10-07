-- M2-006A Product administration grants and RLS for active MANAGER users.

begin;

select plan(51);

insert into auth.users (id, aud, role, email)
values
  ('74000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'manager-product-customer@example.test'),
  ('74000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-product-kitchen@example.test'),
  ('74000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-product-inactive@example.test'),
  ('74000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'manager-product-manager@example.test'),
  ('74000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'manager-product-no-profile@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('74000000-0000-4000-8000-000000000001', 'Product Admin Customer', 'CUSTOMER', true),
  ('74000000-0000-4000-8000-000000000002', 'Product Admin Kitchen', 'KITCHEN', true),
  ('74000000-0000-4000-8000-000000000003', 'Inactive Product Admin', 'MANAGER', false),
  ('74000000-0000-4000-8000-000000000004', 'Product Admin Manager', 'MANAGER', true);

insert into public.businesses (id, name, active)
values ('75000000-0000-4000-8000-000000000001', 'Product Admin Business', true);

insert into public.business_memberships (id, user_id, business_id, active)
values ('76000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000001', true);

insert into public.categories (id, name, active, display_order)
values
  ('77000000-0000-4000-8000-000000000001', 'Product Admin Category One', true, 20),
  ('77000000-0000-4000-8000-000000000002', 'Product Admin Category Two', true, 21);

insert into public.products (
  id, category_id, name, description, unit_code, quantity_step,
  image_path, active, available, availability_updated_at, availability_updated_by
)
values (
  '78000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  'Product Admin Fixture', 'Original description.', 'UNIT', 1,
  null, true, true, '2026-10-01 12:00:00+00', '74000000-0000-4000-8000-000000000004'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.products'::regclass),
  true,
  'RLS remains enabled on products'
);
select is(
  (select count(*)::int from unnest(array['availability_updated_at', 'availability_updated_by']) column_name
   where has_column_privilege('authenticated', 'public.products', column_name, 'SELECT')),
  0,
  'Product availability audit columns remain unreadable to authenticated users'
);
select is(
  (select count(*)::int from unnest(array['INSERT', 'UPDATE', 'DELETE']) privilege_name
   where has_table_privilege('authenticated', 'public.products', privilege_name)),
  0,
  'Product writes are not granted table-wide'
);
select is(
  (select count(*)::int from unnest(array[
      'category_id', 'name', 'description', 'unit_code', 'quantity_step', 'active', 'available'
    ]) column_name
   where has_column_privilege('authenticated', 'public.products', column_name, 'INSERT')),
  7,
  'authenticated receives INSERT only for allowed Product creation fields'
);
select is(
  (select count(*)::int from unnest(array[
      'id', 'image_path', 'availability_updated_at', 'availability_updated_by', 'created_at', 'updated_at'
    ]) column_name
   where has_column_privilege('authenticated', 'public.products', column_name, 'INSERT')),
  0,
  'authenticated cannot provide generated, image or availability audit fields on INSERT'
);
select is(
  (select count(*)::int from unnest(array[
      'category_id', 'name', 'description', 'unit_code', 'quantity_step', 'active'
    ]) column_name
   where has_column_privilege('authenticated', 'public.products', column_name, 'UPDATE')),
  6,
  'authenticated receives UPDATE only for Product administration fields'
);
select is(
  (select count(*)::int from unnest(array[
      'id', 'available', 'availability_updated_at', 'availability_updated_by',
      'image_path', 'created_at', 'updated_at'
    ]) column_name
   where has_column_privilege('authenticated', 'public.products', column_name, 'UPDATE')),
  0,
  'authenticated cannot UPDATE Product identity, availability, image, audit or timestamp fields'
);
select ok(not has_table_privilege('authenticated', 'public.products', 'DELETE'), 'authenticated cannot DELETE Products');
select is(
  (select count(*)::int from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
   where has_table_privilege('anon', 'public.products', privilege_name)),
  0,
  'anon has no Product table privileges'
);

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000004"}', true);
end $$;
select lives_ok(
  $$insert into public.products (
      category_id, name, description, unit_code, quantity_step, active, available
    ) values (
      '77000000-0000-4000-8000-000000000001', 'Manager Created Product',
      'Created by an active Manager.', 'UNIT', 1, true, true
    )$$,
  'active MANAGER can INSERT a valid Product'
);
reset role;
select is((select count(*)::int from public.products where name = 'Manager Created Product'), 1, 'Manager-created Product exists');
select matches(
  (select id::text from public.products where name = 'Manager Created Product'),
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'Manager-created Product receives a database-generated id'
);
select ok(
  (select created_at is not null and updated_at is not null
   from public.products where name = 'Manager Created Product'),
  'Manager-created Product receives database-generated timestamps'
);
select is((select active from public.products where name = 'Manager Created Product'), true, 'created Product preserves explicit active value');
select is((select available from public.products where name = 'Manager Created Product'), true, 'created Product preserves explicit available value');
select is((select image_path from public.products where name = 'Manager Created Product'), null, 'created Product image_path remains NULL');
select is((select availability_updated_at from public.products where name = 'Manager Created Product'), null, 'created Product availability_updated_at remains NULL');
select is((select availability_updated_by from public.products where name = 'Manager Created Product'), null, 'created Product availability_updated_by remains NULL');

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000004"}', true);
end $$;
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, available)
    values ('77000000-0000-4000-8000-000000000001', 'Missing Active Product', 'UNIT', 1, true)$$,
  '23502', null,
  'Product creation requires explicit active'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active)
    values ('77000000-0000-4000-8000-000000000001', 'Missing Available Product', 'UNIT', 1, true)$$,
  '23502', null,
  'Product creation requires explicit available'
);
select lives_ok(
  $$update public.products
    set category_id = '77000000-0000-4000-8000-000000000002',
        name = 'Manager Updated Product',
        description = 'Updated by Manager.',
        unit_code = 'TRAY',
        quantity_step = 0.500,
        active = true
    where name = 'Manager Created Product'$$,
  'active MANAGER can edit Product administration fields'
);
select results_eq(
  $$select category_id, name, description, unit_code, quantity_step, active
    from public.products where name = 'Manager Updated Product'$$,
  $$values (
    '77000000-0000-4000-8000-000000000002'::uuid,
    'Manager Updated Product'::text,
    'Updated by Manager.'::text,
    'TRAY'::text,
    0.500::numeric,
    true
  )$$,
  'Product administration fields persist after Manager update'
);
select lives_ok(
  $$update public.products set active = false where name = 'Manager Updated Product'$$,
  'active MANAGER can deactivate a Product'
);
select is((select active from public.products where name = 'Manager Updated Product'), false, 'Manager-deactivated Product is inactive');
select lives_ok(
  $$update public.products set active = true where name = 'Manager Updated Product'$$,
  'active MANAGER can reactivate a Product'
);
reset role;
select is((select active from public.products where name = 'Manager Updated Product'), true, 'Manager-reactivated Product is active');
select is((select available from public.products where name = 'Manager Updated Product'), true, 'administrative edits do not change availability');
select is(
  (select availability_updated_at from public.products where name = 'Manager Updated Product'),
  null,
  'administrative edits do not set availability_updated_at'
);
select is(
  (select availability_updated_by from public.products where name = 'Manager Updated Product'),
  null,
  'administrative edits do not set availability_updated_by'
);
select is((select image_path from public.products where name = 'Manager Updated Product'), null, 'administrative edits leave image_path NULL');

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000004"}', true);
end $$;
select throws_ok(
  $$update public.products set available = false where id = '78000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'MANAGER cannot directly UPDATE available'
);
select throws_ok(
  $$update public.products set availability_updated_at = now() where id = '78000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'MANAGER cannot directly UPDATE availability_updated_at'
);
select throws_ok(
  $$update public.products set availability_updated_by = '74000000-0000-4000-8000-000000000004'
    where id = '78000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'MANAGER cannot directly UPDATE availability_updated_by'
);
select throws_ok(
  $$update public.products set image_path = 'products/example.webp'
    where id = '78000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'MANAGER cannot directly UPDATE image_path'
);
select throws_ok(
  $$delete from public.products where id = '78000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'MANAGER cannot DELETE Products'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('79000000-0000-4000-8000-000000000001', 'Invalid Category Product', 'UNIT', 1, true, true)$$,
  '23503', null,
  'Product category foreign key rejects an invalid Category'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', '   ', 'UNIT', 1, true, true)$$,
  '23514', null,
  'Product name constraint applies to Manager INSERT'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', 'Blank Unit Product', '   ', 1, true, true)$$,
  '23514', null,
  'Product unit_code constraint applies to Manager INSERT'
);
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', 'Invalid Step Product', 'UNIT', 0, true, true)$$,
  '23514', null,
  'Product quantity_step constraint applies to Manager INSERT'
);
reset role;

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000001"}', true);
end $$;
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', 'Customer Product Write', 'UNIT', 1, true, true)$$,
  '42501', null,
  'CUSTOMER cannot INSERT Products'
);
select lives_ok(
  $$update public.products set name = 'Customer Changed Product' where id = '78000000-0000-4000-8000-000000000001'$$,
  'CUSTOMER cannot UPDATE Products'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000002"}', true);
end $$;
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', 'Kitchen Product Write', 'UNIT', 1, true, true)$$,
  '42501', null,
  'KITCHEN cannot INSERT Products'
);
select lives_ok(
  $$update public.products set name = 'Kitchen Changed Product' where id = '78000000-0000-4000-8000-000000000001'$$,
  'KITCHEN cannot UPDATE Products'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000003"}', true);
end $$;
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', 'Inactive Manager Product Write', 'UNIT', 1, true, true)$$,
  '42501', null,
  'inactive MANAGER cannot INSERT Products'
);
select lives_ok(
  $$update public.products set name = 'Inactive Manager Changed Product' where id = '78000000-0000-4000-8000-000000000001'$$,
  'inactive MANAGER cannot UPDATE Products'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"74000000-0000-4000-8000-000000000005"}', true);
end $$;
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', 'No Profile Product Write', 'UNIT', 1, true, true)$$,
  '42501', null,
  'identity without Profile cannot INSERT Products'
);
select lives_ok(
  $$update public.products set name = 'No Profile Changed Product' where id = '78000000-0000-4000-8000-000000000001'$$,
  'identity without Profile cannot UPDATE Products'
);

reset role;
set local role anon;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
select throws_ok(
  $$insert into public.products (category_id, name, unit_code, quantity_step, active, available)
    values ('77000000-0000-4000-8000-000000000001', 'Anonymous Product Write', 'UNIT', 1, true, true)$$,
  '42501', null,
  'anon cannot INSERT Products'
);
select throws_ok(
  $$update public.products set name = 'Anonymous Changed Product' where id = '78000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'anon cannot UPDATE Products'
);

reset role;
select is(
  (select count(*)::int from public.products
   where id = '78000000-0000-4000-8000-000000000001'
      or name = 'Manager Updated Product'),
  2,
  'denied writes leave Product fixture rows unchanged'
);
select results_eq(
  $$select name, description, active, available, image_path, availability_updated_at, availability_updated_by
    from public.products where id = '78000000-0000-4000-8000-000000000001'$$,
  $$values (
    'Product Admin Fixture'::text,
    'Original description.'::text,
    true,
    true,
    null::text,
    '2026-10-01 12:00:00+00'::timestamptz,
    '74000000-0000-4000-8000-000000000004'::uuid
  )$$,
  'unauthorized Product updates leave fixture values unchanged'
);

select * from finish();

rollback;
