-- M2-002 product RLS and read-only grants for CUSTOMER, KITCHEN and MANAGER.

begin;

select plan(36);

insert into auth.users (id, aud, role, email)
values
  ('61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'products-customer@example.test'),
  ('61000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'products-no-profile@example.test'),
  ('61000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'products-inactive-customer@example.test'),
  ('61000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'products-no-membership@example.test'),
  ('61000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'products-inactive-membership@example.test'),
  ('61000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'products-inactive-business@example.test'),
  ('61000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'products-kitchen@example.test'),
  ('61000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'products-inactive-kitchen@example.test'),
  ('61000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'products-manager@example.test'),
  ('61000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'products-inactive-manager@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('61000000-0000-4000-8000-000000000001', 'Products Customer', 'CUSTOMER', true),
  ('61000000-0000-4000-8000-000000000003', 'Inactive Products Customer', 'CUSTOMER', false),
  ('61000000-0000-4000-8000-000000000004', 'Customer Without Membership', 'CUSTOMER', true),
  ('61000000-0000-4000-8000-000000000005', 'Customer With Inactive Membership', 'CUSTOMER', true),
  ('61000000-0000-4000-8000-000000000006', 'Customer With Inactive Business', 'CUSTOMER', true),
  ('61000000-0000-4000-8000-000000000007', 'Products Kitchen', 'KITCHEN', true),
  ('61000000-0000-4000-8000-000000000008', 'Inactive Products Kitchen', 'KITCHEN', false),
  ('61000000-0000-4000-8000-000000000009', 'Products Manager', 'MANAGER', true),
  ('61000000-0000-4000-8000-000000000010', 'Inactive Products Manager', 'MANAGER', false);

insert into public.businesses (id, name, active)
values
  ('62000000-0000-4000-8000-000000000001', 'Products Active Business', true),
  ('62000000-0000-4000-8000-000000000002', 'Products Inactive Business', false);

insert into public.business_memberships (id, user_id, business_id, active)
values
  ('63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', true),
  ('63000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000005', '62000000-0000-4000-8000-000000000001', false),
  ('63000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000006', '62000000-0000-4000-8000-000000000002', true);

insert into public.categories (id, name, active, display_order)
values
  ('64000000-0000-4000-8000-000000000001', 'Products Active Category', true, 0),
  ('64000000-0000-4000-8000-000000000002', 'Products Inactive Category', false, 1);

insert into public.products (id, category_id, name, unit_code, quantity_step, active, available, availability_updated_at, availability_updated_by)
values
  ('65000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'Available Product', 'EACH', 1, true, true, null, null),
  ('65000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000001', 'Unavailable Product', 'BOX', 0.5, true, false, now(), '61000000-0000-4000-8000-000000000007'),
  ('65000000-0000-4000-8000-000000000003', '64000000-0000-4000-8000-000000000001', 'Inactive Product', 'EACH', 1, false, true, null, null),
  ('65000000-0000-4000-8000-000000000004', '64000000-0000-4000-8000-000000000002', 'Product In Inactive Category', 'EACH', 1, true, true, null, null);

select is(
  (select relrowsecurity from pg_class where oid = 'public.products'::regclass),
  true,
  'RLS is enabled on products'
);
select is(
  (select count(*)::int from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege('anon', 'public.products', p)),
  0,
  'anon has no Product table privileges'
);
select is(
  (select count(*)::int
   from unnest(array[
     'id', 'category_id', 'name', 'description', 'unit_code', 'quantity_step',
     'image_path', 'active', 'available', 'created_at', 'updated_at'
   ]) as allowed_column(column_name)
   where has_column_privilege('authenticated', 'public.products', column_name, 'SELECT')),
  11,
  'authenticated can SELECT all public catalog columns'
);
select ok(
  not has_column_privilege('authenticated', 'public.products', 'availability_updated_at', 'SELECT'),
  'authenticated cannot SELECT availability_updated_at'
);
select ok(
  not has_column_privilege('authenticated', 'public.products', 'availability_updated_by', 'SELECT'),
  'authenticated cannot SELECT availability_updated_by'
);
select is(
  (select count(*)::int from unnest(array['INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege('authenticated', 'public.products', p)),
  0,
  'authenticated has no Product table write privileges'
);

set local role anon;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
select throws_ok($$select * from public.products$$, '42501', 'permission denied for table products', 'anon cannot SELECT products');
select throws_ok($$insert into public.products (category_id, name, unit_code, quantity_step, active, available) values ('64000000-0000-4000-8000-000000000001', 'Anon Product', 'EACH', 1, true, true)$$, '42501', 'permission denied for table products', 'anon cannot INSERT products');
select throws_ok($$update public.products set name = 'Changed' where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'anon cannot UPDATE products');
select throws_ok($$delete from public.products where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'anon cannot DELETE products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000001"}', true);
end $$;
select results_eq(
  $$select id from public.products where id in (
      '65000000-0000-4000-8000-000000000001',
      '65000000-0000-4000-8000-000000000002',
      '65000000-0000-4000-8000-000000000003',
      '65000000-0000-4000-8000-000000000004'
    ) order by id$$,
  $$values ('65000000-0000-4000-8000-000000000001'::uuid), ('65000000-0000-4000-8000-000000000002'::uuid)$$,
  'authorized CUSTOMER reads active Products in active Categories, including unavailable Products'
);
select throws_ok(
  $$select availability_updated_by from public.products where id = '65000000-0000-4000-8000-000000000002'$$,
  '42501', 'permission denied for table products',
  'CUSTOMER cannot directly read internal availability audit metadata'
);
select ok((select not available from public.products where id = '65000000-0000-4000-8000-000000000002'), 'CUSTOMER can read an active but unavailable Product');
select is_empty($$select 1 from public.products where id = '65000000-0000-4000-8000-000000000003'$$, 'CUSTOMER cannot read an inactive Product');
select is_empty($$select 1 from public.products where id = '65000000-0000-4000-8000-000000000004'$$, 'CUSTOMER cannot read a Product in an inactive Category');
select throws_ok($$insert into public.products (category_id, name, unit_code, quantity_step, active, available) values ('64000000-0000-4000-8000-000000000001', 'Customer Product', 'EACH', 1, true, true)$$, '42501', 'permission denied for table products', 'CUSTOMER cannot INSERT products');
select throws_ok($$update public.products set available = false where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'CUSTOMER cannot UPDATE products');
select throws_ok($$delete from public.products where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'CUSTOMER cannot DELETE products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000002"}', true);
end $$;
select is_empty($$select 1 from public.products$$, 'authenticated identity without Profile sees no Products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000003"}', true);
end $$;
select is_empty($$select 1 from public.products$$, 'inactive CUSTOMER Profile sees no Products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000004"}', true);
end $$;
select is_empty($$select 1 from public.products$$, 'CUSTOMER without membership sees no Products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000005"}', true);
end $$;
select is_empty($$select 1 from public.products$$, 'CUSTOMER with only inactive membership sees no Products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000006"}', true);
end $$;
select is_empty($$select 1 from public.products$$, 'CUSTOMER with active membership in inactive Business sees no Products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000007"}', true);
end $$;
select results_eq(
  $$select id from public.products where id in ('65000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000002') order by id$$,
  $$values ('65000000-0000-4000-8000-000000000001'::uuid), ('65000000-0000-4000-8000-000000000002'::uuid)$$,
  'active KITCHEN reads available and unavailable active Products in active Categories'
);
select is_empty($$select 1 from public.products where id = '65000000-0000-4000-8000-000000000003'$$, 'KITCHEN cannot read an inactive Product');
select is_empty($$select 1 from public.products where id = '65000000-0000-4000-8000-000000000004'$$, 'KITCHEN cannot read a Product in an inactive Category');
select throws_ok($$insert into public.products (category_id, name, unit_code, quantity_step, active, available) values ('64000000-0000-4000-8000-000000000001', 'Kitchen Product', 'EACH', 1, true, true)$$, '42501', 'permission denied for table products', 'KITCHEN cannot INSERT products');
select throws_ok($$update public.products set available = false where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'KITCHEN cannot UPDATE product availability in this slice');
select throws_ok($$delete from public.products where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'KITCHEN cannot DELETE products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000008"}', true);
end $$;
select is_empty($$select 1 from public.products$$, 'inactive KITCHEN Profile sees no Products');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000009"}', true);
end $$;
select results_eq(
  $$select id from public.products where id in (
      '65000000-0000-4000-8000-000000000001',
      '65000000-0000-4000-8000-000000000002',
      '65000000-0000-4000-8000-000000000003',
      '65000000-0000-4000-8000-000000000004'
    ) order by id$$,
  $$values ('65000000-0000-4000-8000-000000000001'::uuid), ('65000000-0000-4000-8000-000000000002'::uuid), ('65000000-0000-4000-8000-000000000003'::uuid), ('65000000-0000-4000-8000-000000000004'::uuid)$$,
  'active MANAGER reads Products across availability, active state and Category state'
);
select throws_ok($$insert into public.products (category_id, name, unit_code, quantity_step, active, available) values ('64000000-0000-4000-8000-000000000001', 'Manager Product', 'EACH', 1, true, true)$$, '42501', 'permission denied for table products', 'MANAGER cannot INSERT products in this slice');
select throws_ok($$update public.products set active = false where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'MANAGER cannot UPDATE products in this slice');
select throws_ok($$delete from public.products where id = '65000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table products', 'MANAGER cannot DELETE products in this slice');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000010"}', true);
end $$;
select is_empty($$select 1 from public.products$$, 'inactive MANAGER Profile sees no Products');

reset role;
select is(
  (select count(*)::int
   from public.products
   where id in (
     '65000000-0000-4000-8000-000000000001',
     '65000000-0000-4000-8000-000000000002',
     '65000000-0000-4000-8000-000000000003',
     '65000000-0000-4000-8000-000000000004'
   )),
  4,
  'denied writes leave all Product fixture rows unchanged'
);

select * from finish();

rollback;
