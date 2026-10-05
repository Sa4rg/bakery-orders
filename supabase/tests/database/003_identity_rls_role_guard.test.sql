-- M1 identity RLS role guard: customer membership-based access requires
-- profiles.role = 'CUSTOMER'. An active KITCHEN or MANAGER must not gain
-- customer Business/Membership visibility even if a trusted fixture (or a
-- future administrative mistake) gives them an active BusinessMembership.

begin;

select plan(8);

-- Fixtures (inserted as the trusted test owner).
insert into auth.users (id, aud, role, email)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'guard-customer@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'guard-kitchen@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'guard-manager@example.test');

insert into public.profiles (id, display_name, role, active)
values
  ('30000000-0000-4000-8000-000000000001', 'Guard Customer', 'CUSTOMER', true),
  ('30000000-0000-4000-8000-000000000002', 'Guard Kitchen', 'KITCHEN', true),
  ('30000000-0000-4000-8000-000000000003', 'Guard Manager', 'MANAGER', true);

insert into public.businesses (id, name, active)
values ('20000000-0000-4000-8000-000000000001', 'Guard Business', true);

-- Every profile, including KITCHEN and MANAGER, holds an ACTIVE membership.
insert into public.business_memberships (id, user_id, business_id, active)
values
  ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', true);

-- ===========================================================================
-- KITCHEN with an accidental active membership
-- ===========================================================================

set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000002"}', true);
end $$;

select results_eq(
  $$select id from public.profiles$$,
  $$values ('30000000-0000-4000-8000-000000000002'::uuid)$$,
  'KITCHEN still reads its own Profile'
);

select is_empty(
  $$select 1 from public.business_memberships$$,
  'KITCHEN cannot read memberships even with an active membership row'
);

select is_empty(
  $$select 1 from public.businesses$$,
  'KITCHEN cannot read a Business through an active membership'
);

-- ===========================================================================
-- MANAGER with an accidental active membership
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000003"}', true);
end $$;

select results_eq(
  $$select id from public.profiles$$,
  $$values ('30000000-0000-4000-8000-000000000003'::uuid)$$,
  'MANAGER still reads its own Profile'
);

select is_empty(
  $$select 1 from public.business_memberships$$,
  'MANAGER cannot read memberships even with an active membership row'
);

select is_empty(
  $$select 1 from public.businesses$$,
  'MANAGER cannot read a Business through an active membership'
);

-- ===========================================================================
-- CUSTOMER control: legitimate access is preserved
-- ===========================================================================

reset role;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001"}', true);
end $$;

select results_eq(
  $$select id from public.business_memberships$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'CUSTOMER still reads own membership'
);

select results_eq(
  $$select id from public.businesses$$,
  $$values ('20000000-0000-4000-8000-000000000001'::uuid)$$,
  'CUSTOMER still reads own Business'
);

select * from finish();

rollback;
