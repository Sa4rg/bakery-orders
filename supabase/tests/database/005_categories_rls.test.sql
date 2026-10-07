-- M2-001 category RLS and grants for CUSTOMER, KITCHEN and MANAGER.

begin;

select plan(19);

insert into auth.users (id, aud, role, email)
values
  ('40000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'category-customer@example.test'),
  ('40000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'category-no-profile@example.test'),
  ('40000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'category-inactive-customer@example.test'),
  ('40000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'category-no-membership@example.test'),
  ('40000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'category-inactive-business@example.test'),
  ('40000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'category-kitchen@example.test'),
  ('40000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'category-inactive-kitchen@example.test'),
  ('40000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'category-manager@example.test'),
  ('40000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'category-inactive-manager@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('40000000-0000-4000-8000-000000000001', 'Category Customer', 'CUSTOMER', true),
  ('40000000-0000-4000-8000-000000000003', 'Inactive Category Customer', 'CUSTOMER', false),
  ('40000000-0000-4000-8000-000000000004', 'Customer Without Membership', 'CUSTOMER', true),
  ('40000000-0000-4000-8000-000000000005', 'Customer Inactive Business', 'CUSTOMER', true),
  ('40000000-0000-4000-8000-000000000006', 'Category Kitchen', 'KITCHEN', true),
  ('40000000-0000-4000-8000-000000000007', 'Inactive Category Kitchen', 'KITCHEN', false),
  ('40000000-0000-4000-8000-000000000008', 'Category Manager', 'MANAGER', true),
  ('40000000-0000-4000-8000-000000000009', 'Inactive Category Manager', 'MANAGER', false);

insert into public.businesses (id, name, active)
values
  ('20000000-0000-4000-8000-000000000001', 'Active Category Business', true),
  ('20000000-0000-4000-8000-000000000002', 'Inactive Category Business', false);

insert into public.business_memberships (id, user_id, business_id, active)
values
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', true);

insert into public.categories (id, name, active, display_order)
values
  ('50000000-0000-4000-8000-000000000001', 'Active Category One', true, 0),
  ('50000000-0000-4000-8000-000000000002', 'Active Category Two', true, 1),
  ('50000000-0000-4000-8000-000000000003', 'Inactive Category', false, 2);

select is(
  (select relrowsecurity from pg_class where oid = 'public.categories'::regclass),
  true,
  'RLS is enabled on categories'
);

select ok(has_table_privilege('authenticated', 'public.categories', 'SELECT'), 'authenticated can SELECT categories');
select is(
  (select count(*)::int from unnest(array['INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege('authenticated', 'public.categories', p)),
  0,
  'authenticated has no category table write privileges'
);
select is(
  (select count(*)::int from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege('anon', 'public.categories', p)),
  0,
  'anon has no category table privileges'
);

set local role anon;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
select throws_ok($$select * from public.categories$$, '42501', 'permission denied for table categories', 'anon cannot read categories');
select throws_ok($$insert into public.categories (name) values ('Anonymous Category')$$, '42501', 'permission denied for table categories', 'anon cannot insert categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000001"}', true);
end $$;
select results_eq(
  $$select id from public.categories where id in (
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000003'
    ) order by display_order$$,
  $$values ('50000000-0000-4000-8000-000000000001'::uuid), ('50000000-0000-4000-8000-000000000002'::uuid)$$,
  'active CUSTOMER with active membership in active Business reads active categories only'
);
select throws_ok($$insert into public.categories (name) values ('Customer Write')$$, '42501', null, 'CUSTOMER cannot insert categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000002"}', true);
end $$;
select is_empty($$select 1 from public.categories$$, 'CUSTOMER without Profile sees no categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000003"}', true);
end $$;
select is_empty($$select 1 from public.categories$$, 'inactive CUSTOMER Profile sees no categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000004"}', true);
end $$;
select is_empty($$select 1 from public.categories$$, 'CUSTOMER without active membership sees no categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000005"}', true);
end $$;
select is_empty($$select 1 from public.categories$$, 'CUSTOMER whose membership belongs to inactive Business sees no categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000006"}', true);
end $$;
select results_eq(
  $$select id from public.categories where id in (
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000003'
    ) order by display_order$$,
  $$values ('50000000-0000-4000-8000-000000000001'::uuid), ('50000000-0000-4000-8000-000000000002'::uuid)$$,
  'active KITCHEN reads active categories only'
);
select throws_ok($$delete from public.categories where id = '50000000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table categories', 'KITCHEN cannot delete categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000007"}', true);
end $$;
select is_empty($$select 1 from public.categories$$, 'inactive KITCHEN Profile sees no categories');

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000008"}', true);
end $$;
select results_eq(
  $$select id from public.categories where id in (
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
      '50000000-0000-4000-8000-000000000003'
    ) order by display_order$$,
  $$values ('50000000-0000-4000-8000-000000000001'::uuid), ('50000000-0000-4000-8000-000000000002'::uuid), ('50000000-0000-4000-8000-000000000003'::uuid)$$,
  'active MANAGER reads active and inactive categories'
);
select throws_ok(
  $$delete from public.categories where id = '50000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'MANAGER cannot delete categories'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"40000000-0000-4000-8000-000000000009"}', true);
end $$;
select is_empty($$select 1 from public.categories$$, 'inactive MANAGER Profile sees no categories');

reset role;
select is(
  (select count(*)::int
   from public.categories
   where id in (
     '50000000-0000-4000-8000-000000000001',
     '50000000-0000-4000-8000-000000000002',
     '50000000-0000-4000-8000-000000000003'
   )),
  3,
  'denied category writes leave all fixture rows unchanged'
);

select * from finish();

rollback;
