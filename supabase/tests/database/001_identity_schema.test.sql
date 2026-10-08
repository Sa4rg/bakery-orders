-- M1 identity schema: app_role, profiles, businesses, business_memberships.
-- Verifies structure, constraints, defaults, foreign keys and the absence of
-- unexpected SECURITY DEFINER functions and auth.users triggers.

begin;

select plan(59);

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

select has_enum('public', 'app_role', 'public.app_role exists');

select enum_has_labels(
  'public',
  'app_role',
  array['CUSTOMER', 'KITCHEN', 'MANAGER'],
  'app_role contains exactly CUSTOMER, KITCHEN, MANAGER'
);

-- ---------------------------------------------------------------------------
-- Tables and primary keys
-- ---------------------------------------------------------------------------

select has_table('public', 'profiles', 'public.profiles exists');
select has_table('public', 'businesses', 'public.businesses exists');
select has_table('public', 'business_memberships', 'public.business_memberships exists');

select col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');
select col_is_pk('public', 'businesses', 'id', 'businesses.id is the primary key');
select col_is_pk('public', 'business_memberships', 'id', 'business_memberships.id is the primary key');

-- ---------------------------------------------------------------------------
-- Foreign keys and delete behavior
-- ---------------------------------------------------------------------------

select fk_ok(
  'public', 'profiles', 'id',
  'auth', 'users', 'id',
  'profiles.id references auth.users.id'
);

select fk_ok(
  'public', 'business_memberships', 'user_id',
  'public', 'profiles', 'id',
  'business_memberships.user_id references profiles.id'
);

select fk_ok(
  'public', 'business_memberships', 'business_id',
  'public', 'businesses', 'id',
  'business_memberships.business_id references businesses.id'
);

select is(
  (
    select count(*)::int
    from pg_constraint
    where contype = 'f'
      and confdeltype = 'r'
      and conrelid in (
        'public.profiles'::regclass,
        'public.business_memberships'::regclass
      )
  ),
  3,
  'all three identity foreign keys use ON DELETE RESTRICT'
);

select col_is_unique(
  'public',
  'business_memberships',
  array['user_id', 'business_id'],
  'business_memberships is unique per (user_id, business_id)'
);

-- ---------------------------------------------------------------------------
-- NOT NULL / nullable columns
-- ---------------------------------------------------------------------------

select col_not_null('public', 'profiles', 'display_name', 'profiles.display_name is NOT NULL');
select col_not_null('public', 'profiles', 'role', 'profiles.role is NOT NULL');
select col_not_null('public', 'profiles', 'active', 'profiles.active is NOT NULL');
select col_not_null('public', 'profiles', 'created_at', 'profiles.created_at is NOT NULL');
select col_not_null('public', 'profiles', 'updated_at', 'profiles.updated_at is NOT NULL');

select col_not_null('public', 'businesses', 'name', 'businesses.name is NOT NULL');
select col_not_null('public', 'businesses', 'active', 'businesses.active is NOT NULL');
select col_not_null('public', 'businesses', 'created_at', 'businesses.created_at is NOT NULL');
select col_not_null('public', 'businesses', 'updated_at', 'businesses.updated_at is NOT NULL');

select col_not_null('public', 'business_memberships', 'user_id', 'business_memberships.user_id is NOT NULL');
select col_not_null('public', 'business_memberships', 'business_id', 'business_memberships.business_id is NOT NULL');
select col_not_null('public', 'business_memberships', 'active', 'business_memberships.active is NOT NULL');
select col_not_null('public', 'business_memberships', 'created_at', 'business_memberships.created_at is NOT NULL');
select col_not_null('public', 'business_memberships', 'updated_at', 'business_memberships.updated_at is NOT NULL');

select col_is_null('public', 'businesses', 'contact_name', 'businesses.contact_name is nullable');
select col_is_null('public', 'businesses', 'contact_phone', 'businesses.contact_phone is nullable');
select col_is_null('public', 'businesses', 'delivery_address', 'businesses.delivery_address is nullable');
select col_is_null('public', 'businesses', 'notes', 'businesses.notes is nullable');

-- ---------------------------------------------------------------------------
-- Defaults and types
-- ---------------------------------------------------------------------------

select col_default_is('public', 'profiles', 'active', true, 'profiles.active defaults to true');
select col_default_is('public', 'businesses', 'active', true, 'businesses.active defaults to true');
select col_default_is('public', 'business_memberships', 'active', true, 'business_memberships.active defaults to true');

select col_has_default('public', 'profiles', 'created_at', 'profiles.created_at has a default');
select col_has_default('public', 'profiles', 'updated_at', 'profiles.updated_at has a default');
select col_has_default('public', 'businesses', 'created_at', 'businesses.created_at has a default');
select col_has_default('public', 'businesses', 'updated_at', 'businesses.updated_at has a default');
select col_has_default('public', 'business_memberships', 'created_at', 'business_memberships.created_at has a default');
select col_has_default('public', 'business_memberships', 'updated_at', 'business_memberships.updated_at has a default');

select col_has_default('public', 'businesses', 'id', 'businesses.id has a default');
select col_has_default('public', 'business_memberships', 'id', 'business_memberships.id has a default');

select col_type_is(
  'public', 'profiles', 'role',
  'public', 'app_role',
  'profiles.role uses public.app_role'
);

select is(
  (
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('profiles', 'businesses', 'business_memberships')
      and column_name in ('created_at', 'updated_at')
      and data_type <> 'timestamp with time zone'
  ),
  0,
  'all audit timestamps are timestamptz'
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

select has_index(
  'public', 'business_memberships', 'business_memberships_user_id_active_idx',
  array['user_id', 'active']::name[],
  'index on business_memberships (user_id, active)'
);

select has_index(
  'public', 'business_memberships', 'business_memberships_business_id_active_idx',
  array['business_id', 'active']::name[],
  'index on business_memberships (business_id, active)'
);

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as the trusted test owner)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'schema-user-1@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'schema-user-2@example.test');

insert into public.profiles (id, display_name, role)
values ('30000000-0000-4000-8000-000000000001', 'Schema User One', 'CUSTOMER');

insert into public.businesses (id, name)
values ('20000000-0000-4000-8000-000000000001', 'Schema Business One');

insert into public.business_memberships (user_id, business_id)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Check constraints
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.profiles (id, display_name, role)
    values ('30000000-0000-4000-8000-000000000002', '   ', 'CUSTOMER')$$,
  '23514',
  null,
  'profiles rejects a whitespace-only display_name'
);

select throws_ok(
  $$insert into public.profiles (id, display_name, role)
    values ('30000000-0000-4000-8000-000000000002', '', 'CUSTOMER')$$,
  '23514',
  null,
  'profiles rejects an empty display_name'
);

select throws_ok(
  $$insert into public.profiles (id, display_name, role)
    values ('30000000-0000-4000-8000-000000000002', E' \t\n ', 'CUSTOMER')$$,
  '23514',
  null,
  'profiles rejects a display_name made only of tabs/newlines/spaces'
);

select throws_ok(
  $$insert into public.businesses (name) values ('   ')$$,
  '23514',
  null,
  'businesses rejects a whitespace-only name'
);

select throws_ok(
  $$insert into public.businesses (name) values ('')$$,
  '23514',
  null,
  'businesses rejects an empty name'
);

select throws_ok(
  $$insert into public.business_memberships (user_id, business_id)
    values (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    )$$,
  '23505',
  null,
  'duplicate (user_id, business_id) memberships are rejected'
);

select throws_ok(
  $$insert into public.profiles (id, display_name, role)
    values ('30000000-0000-4000-8000-0000000000ff', 'Orphan Profile', 'CUSTOMER')$$,
  '23503',
  null,
  'a profile cannot exist without an auth.users identity'
);

select throws_ok(
  $$insert into public.profiles (id, display_name, role)
    values ('30000000-0000-4000-8000-000000000002', 'Invalid Role User', 'ADMIN')$$,
  '22P02',
  null,
  'profiles rejects roles outside app_role'
);

-- ---------------------------------------------------------------------------
-- ON DELETE RESTRICT behavior
-- ---------------------------------------------------------------------------

select throws_ok(
  $$delete from auth.users where id = '30000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'an auth identity with a profile cannot be deleted'
);

select throws_ok(
  $$delete from public.profiles where id = '30000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'a profile with memberships cannot be deleted'
);

select throws_ok(
  $$delete from public.businesses where id = '20000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'a business with memberships cannot be deleted'
);

-- ---------------------------------------------------------------------------
-- Explicitly excluded mechanisms
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.oid <> 'public.set_product_availability(uuid,boolean)'::regprocedure
  ),
  0,
  'no unexpected SECURITY DEFINER function exists in the public schema'
);

select is(
  (
    select count(*)::int
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ),
  0,
  'no user-defined trigger exists on auth.users'
);

select * from finish();

rollback;
