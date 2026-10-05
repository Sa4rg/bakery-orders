-- M1 identity RLS: grants, policies and authorization behavior for
-- profiles, businesses and business_memberships.
--
-- Request context is simulated PostgREST-style: `set local role` plus
-- transaction-local `request.jwt.claims`. Fixtures are inserted as the trusted
-- test owner before any role switch.

begin;

select plan(64);

-- ---------------------------------------------------------------------------
-- Fixtures (fictional, deterministic)
--
-- Users
--   ...0001 Customer A            profile active, membership active   -> Business A
--   ...0002 Customer A2           profile active, membership active   -> Business A
--   ...0003 Customer B            profile active, membership active   -> Business B
--   ...0004 Inactive membership   profile active, membership inactive -> Business A
--   ...0005 Inactive profile      profile inactive, membership active -> Business A
--   ...0006 Customer C            profile active, membership active   -> Business C (inactive)
--   ...0007 Kitchen               profile active, no membership
--   ...0008 Manager               profile active, no membership
--   ...0009 No profile            auth identity only
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'customer-a@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'customer-a2@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'customer-b@example.test'),
  ('30000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'inactive-membership@example.test'),
  ('30000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'inactive-profile@example.test'),
  ('30000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'customer-c@example.test'),
  ('30000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'kitchen@example.test'),
  ('30000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'manager@example.test'),
  ('30000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'no-profile@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('30000000-0000-4000-8000-000000000001', 'Customer A', 'CUSTOMER', true),
  ('30000000-0000-4000-8000-000000000002', 'Customer A2', 'CUSTOMER', true),
  ('30000000-0000-4000-8000-000000000003', 'Customer B', 'CUSTOMER', true),
  ('30000000-0000-4000-8000-000000000004', 'Inactive Membership', 'CUSTOMER', true),
  ('30000000-0000-4000-8000-000000000005', 'Inactive Profile', 'CUSTOMER', false),
  ('30000000-0000-4000-8000-000000000006', 'Customer C', 'CUSTOMER', true),
  ('30000000-0000-4000-8000-000000000007', 'Kitchen User', 'KITCHEN', true),
  ('30000000-0000-4000-8000-000000000008', 'Manager User', 'MANAGER', true);

insert into public.businesses (id, name, active)
values
  ('20000000-0000-4000-8000-000000000001', 'Business A', true),
  ('20000000-0000-4000-8000-000000000002', 'Business B', true),
  ('20000000-0000-4000-8000-000000000003', 'Business C', false);

insert into public.business_memberships (id, user_id, business_id, active)
values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', true),
  ('10000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', false),
  ('10000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', true);

-- ---------------------------------------------------------------------------
-- RLS enabled
-- ---------------------------------------------------------------------------

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'RLS is enabled on profiles'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.businesses'::regclass),
  true,
  'RLS is enabled on businesses'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.business_memberships'::regclass),
  true,
  'RLS is enabled on business_memberships'
);

-- ---------------------------------------------------------------------------
-- Grants: authenticated is read-only, anon has nothing
-- ---------------------------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated can SELECT profiles'
);
select ok(
  has_table_privilege('authenticated', 'public.businesses', 'SELECT'),
  'authenticated can SELECT businesses'
);
select ok(
  has_table_privilege('authenticated', 'public.business_memberships', 'SELECT'),
  'authenticated can SELECT business_memberships'
);

select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
    where has_table_privilege('authenticated', 'public.profiles', privilege)
  ),
  0,
  'authenticated has no write/structural table privileges on profiles'
);
select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
    where has_table_privilege('authenticated', 'public.businesses', privilege)
  ),
  0,
  'authenticated has no write/structural table privileges on businesses'
);
select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
    where has_table_privilege('authenticated', 'public.business_memberships', privilege)
  ),
  0,
  'authenticated has no write/structural table privileges on business_memberships'
);

select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'REFERENCES']) as privilege
    where has_any_column_privilege('authenticated', 'public.profiles', privilege)
  ),
  0,
  'authenticated has no column-level write privileges on profiles'
);
select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'REFERENCES']) as privilege
    where has_any_column_privilege('authenticated', 'public.businesses', privilege)
  ),
  0,
  'authenticated has no column-level write privileges on businesses'
);
select is(
  (
    select count(*)::int
    from unnest(array['INSERT', 'UPDATE', 'REFERENCES']) as privilege
    where has_any_column_privilege('authenticated', 'public.business_memberships', privilege)
  ),
  0,
  'authenticated has no column-level write privileges on business_memberships'
);

select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
    where has_table_privilege('anon', 'public.profiles', privilege)
  ),
  0,
  'anon has no table privileges on profiles'
);
select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
    where has_table_privilege('anon', 'public.businesses', privilege)
  ),
  0,
  'anon has no table privileges on businesses'
);
select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege
    where has_table_privilege('anon', 'public.business_memberships', privilege)
  ),
  0,
  'anon has no table privileges on business_memberships'
);

select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as privilege
    where has_any_column_privilege('anon', 'public.profiles', privilege)
  ),
  0,
  'anon has no column privileges on profiles'
);
select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as privilege
    where has_any_column_privilege('anon', 'public.businesses', privilege)
  ),
  0,
  'anon has no column privileges on businesses'
);
select is(
  (
    select count(*)::int
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as privilege
    where has_any_column_privilege('anon', 'public.business_memberships', privilege)
  ),
  0,
  'anon has no column privileges on business_memberships'
);

-- ---------------------------------------------------------------------------
-- Policy inventory: exactly one SELECT policy per table, for authenticated
-- ---------------------------------------------------------------------------

select policies_are(
  'public', 'profiles',
  array['profiles_select_own'],
  'profiles has exactly one policy'
);
select policies_are(
  'public', 'business_memberships',
  array['business_memberships_select_own_active_profile'],
  'business_memberships has exactly one policy'
);
select policies_are(
  'public', 'businesses',
  array['businesses_select_with_active_membership'],
  'businesses has exactly one policy'
);

select policy_cmd_is('public', 'profiles', 'profiles_select_own', 'SELECT',
  'profiles policy applies to SELECT only');
select policy_cmd_is('public', 'business_memberships', 'business_memberships_select_own_active_profile', 'SELECT',
  'business_memberships policy applies to SELECT only');
select policy_cmd_is('public', 'businesses', 'businesses_select_with_active_membership', 'SELECT',
  'businesses policy applies to SELECT only');

select policy_roles_are('public', 'profiles', 'profiles_select_own', array['authenticated'],
  'profiles policy targets authenticated only');
select policy_roles_are('public', 'business_memberships', 'business_memberships_select_own_active_profile', array['authenticated'],
  'business_memberships policy targets authenticated only');
select policy_roles_are('public', 'businesses', 'businesses_select_with_active_membership', array['authenticated'],
  'businesses policy targets authenticated only');

-- ===========================================================================
-- Customer A (profile active, membership active -> Business A)
-- ===========================================================================

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}', true);
end $$;

-- PROFILES

select results_eq(
  $$select id from public.profiles$$,
  $$values ('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'Customer A reads only Profile A'
);

select is_empty(
  $$select 1 from public.profiles where id = '30000000-0000-4000-8000-000000000003'$$,
  'Customer A cannot read Profile B'
);

select throws_ok(
  $$update public.profiles set role = 'MANAGER' where id = (select auth.uid())$$,
  '42501',
  'permission denied for table profiles',
  'THR-004: Customer A cannot escalate own role to MANAGER'
);

select throws_ok(
  $$update public.profiles set active = false where id = (select auth.uid())$$,
  '42501',
  'permission denied for table profiles',
  'Customer A cannot update own active flag'
);

select throws_ok(
  $$update public.profiles set display_name = 'Renamed' where id = (select auth.uid())$$,
  '42501',
  'permission denied for table profiles',
  'Customer A cannot update own display_name through the Data API'
);

select throws_ok(
  $$delete from public.profiles where id = (select auth.uid())$$,
  '42501',
  'permission denied for table profiles',
  'Customer A cannot delete a profile'
);

-- MEMBERSHIPS

select results_eq(
  $$select id from public.business_memberships$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'Customer A reads only own membership'
);

select is_empty(
  $$select 1 from public.business_memberships
    where user_id = '30000000-0000-4000-8000-000000000003'$$,
  'Customer A cannot read Customer B membership'
);

select is_empty(
  $$select 1 from public.business_memberships
    where user_id = '30000000-0000-4000-8000-000000000002'$$,
  'Customer A cannot read a coworker membership in the same business'
);

select throws_ok(
  $$insert into public.business_memberships (user_id, business_id)
    values (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  'permission denied for table business_memberships',
  'THR-005: Customer A cannot associate themselves with Business B'
);

select throws_ok(
  $$update public.business_memberships
    set business_id = '20000000-0000-4000-8000-000000000002'
    where user_id = (select auth.uid())$$,
  '42501',
  'permission denied for table business_memberships',
  'Customer A cannot move own membership to Business B'
);

select throws_ok(
  $$delete from public.business_memberships where user_id = (select auth.uid())$$,
  '42501',
  'permission denied for table business_memberships',
  'Customer A cannot delete memberships'
);

-- BUSINESSES

select results_eq(
  $$select id from public.businesses$$,
  $$values ('20000000-0000-4000-8000-000000000001'::uuid)$$,
  'Customer A reads only Business A'
);

select is_empty(
  $$select 1 from public.businesses where id = '20000000-0000-4000-8000-000000000002'$$,
  'Customer A cannot read Business B'
);

select throws_ok(
  $$insert into public.businesses (name) values ('Injected Business')$$,
  '42501',
  'permission denied for table businesses',
  'Customer A cannot insert businesses'
);

select throws_ok(
  $$update public.businesses set name = 'Renamed' where id = '20000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table businesses',
  'Customer A cannot update businesses'
);

select throws_ok(
  $$delete from public.businesses where id = '20000000-0000-4000-8000-000000000001'$$,
  '42501',
  'permission denied for table businesses',
  'Customer A cannot delete businesses'
);

-- ===========================================================================
-- Customer A2 (same business as A)
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000002"}', true);
end $$;

select results_eq(
  $$select id from public.businesses$$,
  $$values ('20000000-0000-4000-8000-000000000001'::uuid)$$,
  'Customer A2 reads Business A through own active membership'
);

-- ===========================================================================
-- Customer B (profile active, membership active -> Business B)
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000003"}', true);
end $$;

select results_eq(
  $$select id from public.businesses$$,
  $$values ('20000000-0000-4000-8000-000000000002'::uuid)$$,
  'Customer B reads only Business B'
);

select is_empty(
  $$select 1 from public.businesses where id = '20000000-0000-4000-8000-000000000001'$$,
  'Customer B cannot read Business A'
);

-- ===========================================================================
-- Inactive membership (profile active, membership inactive -> Business A)
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000004"}', true);
end $$;

select results_eq(
  $$select id from public.business_memberships$$,
  $$values ('10000000-0000-4000-8000-000000000004'::uuid)$$,
  'active Profile can still read own inactive membership record'
);

select is_empty(
  $$select 1 from public.businesses$$,
  'inactive membership does not authorize Business A'
);

-- ===========================================================================
-- Inactive profile (profile inactive, membership active -> Business A)
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000005"}', true);
end $$;

select results_eq(
  $$select id from public.profiles$$,
  $$values ('30000000-0000-4000-8000-000000000005'::uuid)$$,
  'inactive Profile can still read its own Profile row'
);

select is_empty(
  $$select 1 from public.business_memberships$$,
  'inactive Profile cannot read memberships'
);

select is_empty(
  $$select 1 from public.businesses$$,
  'inactive Profile cannot read Business A despite an active membership'
);

-- ===========================================================================
-- Customer C (active membership -> inactive Business C)
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000006"}', true);
end $$;

select results_eq(
  $$select id from public.businesses$$,
  $$values ('20000000-0000-4000-8000-000000000003'::uuid)$$,
  'inactive Business stays readable when Profile and membership are active'
);

-- ===========================================================================
-- Kitchen / Manager: no broad Business access in this slice
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000007"}', true);
end $$;

select is_empty(
  $$select 1 from public.businesses$$,
  'KITCHEN has no broad Business access yet'
);

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000008"}', true);
end $$;

select is_empty(
  $$select 1 from public.businesses$$,
  'MANAGER has no broad Business access yet'
);

-- ===========================================================================
-- Authenticated identity without a Profile
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000009"}', true);
end $$;

select is_empty(
  $$select 1 from public.profiles$$,
  'identity without a Profile sees no profiles'
);

select is_empty(
  $$select 1 from public.businesses$$,
  'identity without a Profile sees no businesses'
);

select throws_ok(
  $$insert into public.profiles (id, display_name, role)
    values ('30000000-0000-4000-8000-000000000009', 'Self Registered Manager', 'MANAGER')$$,
  '42501',
  'permission denied for table profiles',
  'authenticated identity cannot self-create a privileged Profile'
);

-- ===========================================================================
-- Anonymous
-- ===========================================================================

reset role;
set local role anon;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'anon cannot read profiles'
);

select throws_ok(
  $$select * from public.business_memberships$$,
  '42501',
  'permission denied for table business_memberships',
  'anon cannot read business_memberships'
);

select throws_ok(
  $$select * from public.businesses$$,
  '42501',
  'permission denied for table businesses',
  'anon cannot read businesses'
);

-- ===========================================================================
-- Data unchanged after every denied write (verified as trusted owner)
-- ===========================================================================

reset role;

select is(
  (select role::text from public.profiles where id = '30000000-0000-4000-8000-000000000001'),
  'CUSTOMER',
  'Profile A role is still CUSTOMER after the escalation attempt'
);

select is(
  (
    select count(*)::int from public.business_memberships
    where user_id = '30000000-0000-4000-8000-000000000001'
      and business_id = '20000000-0000-4000-8000-000000000001'
  ),
  1,
  'Customer A membership is unchanged after denied writes'
);

select is(
  (select count(*)::int from public.businesses),
  3,
  'no Business was inserted, renamed away or deleted by denied writes'
);

select * from finish();

rollback;
