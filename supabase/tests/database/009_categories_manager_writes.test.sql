-- M2-006A Category write grants and RLS for active MANAGER users.

begin;

select plan(33);

insert into auth.users (id, aud, role, email)
values
  ('70000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'manager-category-customer@example.test'),
  ('70000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-category-kitchen@example.test'),
  ('70000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'manager-category-inactive@example.test'),
  ('70000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'manager-category-manager@example.test'),
  ('70000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'manager-category-no-profile@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('70000000-0000-4000-8000-000000000001', 'Category Admin Customer', 'CUSTOMER', true),
  ('70000000-0000-4000-8000-000000000002', 'Category Admin Kitchen', 'KITCHEN', true),
  ('70000000-0000-4000-8000-000000000003', 'Inactive Category Admin', 'MANAGER', false),
  ('70000000-0000-4000-8000-000000000004', 'Category Admin Manager', 'MANAGER', true);

insert into public.businesses (id, name, active)
values ('71000000-0000-4000-8000-000000000001', 'Category Admin Business', true);

insert into public.business_memberships (id, user_id, business_id, active)
values ('72000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', true);

insert into public.categories (id, name, active, display_order)
values ('73000000-0000-4000-8000-000000000001', 'Category Admin Fixture', true, 9);

select is(
  (select relrowsecurity from pg_class where oid = 'public.categories'::regclass),
  true,
  'RLS remains enabled on categories'
);
select ok(has_table_privilege('authenticated', 'public.categories', 'SELECT'), 'authenticated retains Category SELECT');
select is(
  (select count(*)::int from unnest(array['INSERT', 'UPDATE', 'DELETE']) privilege_name
   where has_table_privilege('authenticated', 'public.categories', privilege_name)),
  0,
  'Category writes are not granted table-wide'
);
select is(
  (select count(*)::int from unnest(array['name', 'description', 'active', 'display_order']) column_name
   where has_column_privilege('authenticated', 'public.categories', column_name, 'INSERT')),
  4,
  'authenticated receives INSERT only for Category administration fields'
);
select is(
  (select count(*)::int from unnest(array['id', 'created_at', 'updated_at']) column_name
   where has_column_privilege('authenticated', 'public.categories', column_name, 'INSERT')),
  0,
  'authenticated cannot provide generated Category fields on INSERT'
);
select is(
  (select count(*)::int from unnest(array['name', 'description', 'active', 'display_order']) column_name
   where has_column_privilege('authenticated', 'public.categories', column_name, 'UPDATE')),
  4,
  'authenticated receives UPDATE only for Category administration fields'
);
select is(
  (select count(*)::int from unnest(array['id', 'created_at', 'updated_at']) column_name
   where has_column_privilege('authenticated', 'public.categories', column_name, 'UPDATE')),
  0,
  'authenticated cannot update generated Category fields'
);
select ok(not has_table_privilege('authenticated', 'public.categories', 'DELETE'), 'authenticated cannot DELETE Categories');
select is(
  (select count(*)::int from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) privilege_name
   where has_table_privilege('anon', 'public.categories', privilege_name)),
  0,
  'anon has no Category table privileges'
);

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000004"}', true);
end $$;
select lives_ok(
  $$insert into public.categories (name, description, active, display_order)
    values ('Manager Created Category', 'Created by an active Manager.', true, 10)$$,
  'active MANAGER can INSERT a Category without supplying generated fields'
);
reset role;
select is(
  (select count(*)::int from public.categories where name = 'Manager Created Category'),
  1,
  'Manager-created Category has a database-generated row'
);
select ok(
  (select id is not null and created_at is not null and updated_at is not null
   from public.categories where name = 'Manager Created Category'),
  'Manager-created Category receives a generated id and timestamps'
);

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000004"}', true);
end $$;
select lives_ok(
  $$update public.categories
    set name = 'Manager Updated Category', description = 'Updated by Manager.', display_order = 11
    where name = 'Manager Created Category'$$,
  'active MANAGER can edit Category name, description and display_order'
);
select results_eq(
  $$select name, description, display_order from public.categories where name = 'Manager Updated Category'$$,
  $$values ('Manager Updated Category'::text, 'Updated by Manager.'::text, 11)$$,
  'Category administrative fields persist after Manager update'
);
select lives_ok(
  $$update public.categories set active = false where name = 'Manager Updated Category'$$,
  'active MANAGER can deactivate a Category'
);
select is((select active from public.categories where name = 'Manager Updated Category'), false, 'Manager-deactivated Category is inactive');
select lives_ok(
  $$update public.categories set active = true where name = 'Manager Updated Category'$$,
  'active MANAGER can reactivate a Category'
);
select is((select active from public.categories where name = 'Manager Updated Category'), true, 'Manager-reactivated Category is active');
select throws_ok(
  $$delete from public.categories where id = '73000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'MANAGER cannot DELETE Categories'
);
select throws_ok(
  $$insert into public.categories (name) values ('   ')$$,
  '23514', null,
  'Category name constraint applies to Manager INSERT'
);
select throws_ok(
  $$insert into public.categories (name, display_order) values ('Manager Negative Order', -1)$$,
  '23514', null,
  'Category display_order constraint applies to Manager INSERT'
);
reset role;

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000001"}', true);
end $$;
select throws_ok(
  $$insert into public.categories (name, active, display_order) values ('Customer Category Write', true, 0)$$,
  '42501', null,
  'CUSTOMER cannot INSERT Categories'
);
select lives_ok(
  $$update public.categories set name = 'Customer Changed Category'
    where id = '73000000-0000-4000-8000-000000000001'$$,
  'CUSTOMER cannot UPDATE Categories'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000002"}', true);
end $$;
select throws_ok(
  $$insert into public.categories (name, active, display_order) values ('Kitchen Category Write', true, 0)$$,
  '42501', null,
  'KITCHEN cannot INSERT Categories'
);
select lives_ok(
  $$update public.categories set name = 'Kitchen Changed Category'
    where id = '73000000-0000-4000-8000-000000000001'$$,
  'KITCHEN cannot UPDATE Categories'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000003"}', true);
end $$;
select throws_ok(
  $$insert into public.categories (name, active, display_order) values ('Inactive Manager Category Write', true, 0)$$,
  '42501', null,
  'inactive MANAGER cannot INSERT Categories'
);
select lives_ok(
  $$update public.categories set name = 'Inactive Manager Changed Category'
    where id = '73000000-0000-4000-8000-000000000001'$$,
  'inactive MANAGER cannot UPDATE Categories'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"70000000-0000-4000-8000-000000000005"}', true);
end $$;
select throws_ok(
  $$insert into public.categories (name, active, display_order) values ('No Profile Category Write', true, 0)$$,
  '42501', null,
  'identity without Profile cannot INSERT Categories'
);
select lives_ok(
  $$update public.categories set name = 'No Profile Changed Category'
    where id = '73000000-0000-4000-8000-000000000001'$$,
  'identity without Profile cannot UPDATE Categories'
);

reset role;
set local role anon;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
select throws_ok(
  $$insert into public.categories (name) values ('Anonymous Category Write')$$,
  '42501', null,
  'anon cannot INSERT Categories'
);
select throws_ok(
  $$update public.categories set name = 'Anonymous Changed Category' where id = '73000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'anon cannot UPDATE Categories'
);

reset role;
select is(
  (select count(*)::int from public.categories
   where id = '73000000-0000-4000-8000-000000000001'
      or name = 'Manager Updated Category'),
  2,
  'denied writes leave Category fixture rows unchanged'
);
select is(
  (select name from public.categories where id = '73000000-0000-4000-8000-000000000001'),
  'Category Admin Fixture',
  'unauthorized Category updates do not change the fixture'
);

select * from finish();

rollback;
