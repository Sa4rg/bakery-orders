-- M2-007 Product availability trusted command.
--
-- Verifies the SECURITY DEFINER boundary, role authorization, operational
-- KITCHEN restrictions, trusted metadata and regression protection against
-- direct Product availability writes.

begin;

select plan(42);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email)
values
  (
    '81000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'availability-customer@example.test'
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'availability-kitchen@example.test'
  ),
  (
    '81000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'availability-inactive-kitchen@example.test'
  ),
  (
    '81000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'availability-manager@example.test'
  ),
  (
    '81000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'availability-inactive-manager@example.test'
  ),
  (
    '81000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'availability-no-profile@example.test'
  );

insert into public.profiles (id, display_name, role, active)
values
  (
    '81000000-0000-4000-8000-000000000001',
    'Availability Customer',
    'CUSTOMER',
    true
  ),
  (
    '81000000-0000-4000-8000-000000000002',
    'Availability Kitchen',
    'KITCHEN',
    true
  ),
  (
    '81000000-0000-4000-8000-000000000003',
    'Inactive Availability Kitchen',
    'KITCHEN',
    false
  ),
  (
    '81000000-0000-4000-8000-000000000004',
    'Availability Manager',
    'MANAGER',
    true
  ),
  (
    '81000000-0000-4000-8000-000000000005',
    'Inactive Availability Manager',
    'MANAGER',
    false
  );

insert into public.categories (id, name, active, display_order)
values
  (
    '82000000-0000-4000-8000-000000000001',
    'Availability Active Category',
    true,
    100
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    'Availability Inactive Category',
    false,
    101
  );

insert into public.products (
  id,
  category_id,
  name,
  unit_code,
  quantity_step,
  active,
  available,
  availability_updated_at,
  availability_updated_by
)
values
  (
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'Availability Active Product',
    'UNIT',
    1,
    true,
    true,
    null,
    null
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    'Availability Inactive Product',
    'UNIT',
    1,
    false,
    true,
    null,
    null
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000002',
    'Availability Product In Inactive Category',
    'UNIT',
    1,
    true,
    true,
    null,
    null
  ),
  (
    '83000000-0000-4000-8000-000000000004',
    '82000000-0000-4000-8000-000000000001',
    'Availability Same Value Product',
    'UNIT',
    1,
    true,
    true,
    '2020-01-01 00:00:00+00',
    '81000000-0000-4000-8000-000000000004'
  );

-- ---------------------------------------------------------------------------
-- Function definition and privileges
-- ---------------------------------------------------------------------------

select ok(
  to_regprocedure('public.set_product_availability(uuid,boolean)') is not null,
  'set_product_availability(uuid, boolean) exists'
);

select is(
  (
    select proc.prosecdef
    from pg_catalog.pg_proc as proc
    where proc.oid =
      'public.set_product_availability(uuid,boolean)'::regprocedure
  ),
  true,
  'availability command is SECURITY DEFINER'
);

select ok(
  (
    select coalesce(
      proc.proconfig @> array['search_path=""']::text[],
      false
    )
    from pg_catalog.pg_proc as proc
    where proc.oid =
      'public.set_product_availability(uuid,boolean)'::regprocedure
  ),
  'availability command uses an empty search_path'
);

select ok(
  (
    select pg_catalog.pg_get_userbyid(proc.proowner)
      not in ('anon', 'authenticated')
    from pg_catalog.pg_proc as proc
    where proc.oid =
      'public.set_product_availability(uuid,boolean)'::regprocedure
  ),
  'availability command is owned by a trusted database role'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        proc.proacl,
        pg_catalog.acldefault('f', proc.proowner)
      )
    ) as acl
    where proc.oid =
      'public.set_product_availability(uuid,boolean)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot EXECUTE the availability command'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.set_product_availability(uuid,boolean)',
    'EXECUTE'
  ),
  'anon cannot EXECUTE the availability command'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.set_product_availability(uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated can EXECUTE the availability command'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.products',
    'available',
    'UPDATE'
  ),
  'authenticated still cannot directly UPDATE available'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.products',
    'availability_updated_at',
    'UPDATE'
  ),
  'authenticated still cannot directly UPDATE availability_updated_at'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.products',
    'availability_updated_by',
    'UPDATE'
  ),
  'authenticated still cannot directly UPDATE availability_updated_by'
);

-- ---------------------------------------------------------------------------
-- Unauthorized callers
-- ---------------------------------------------------------------------------

set local role anon;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"anon"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000001',
      false
    )
  $$,
  '42501',
  null,
  'anon cannot call the availability command'
);

reset role;

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000001',
      false
    )
  $$,
  '42501',
  'Product availability change is not allowed.',
  'CUSTOMER cannot change Product availability'
);

reset role;

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000003"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000001',
      false
    )
  $$,
  '42501',
  'Product availability change is not allowed.',
  'inactive KITCHEN cannot change Product availability'
);

reset role;

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000005"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000001',
      false
    )
  $$,
  '42501',
  'Product availability change is not allowed.',
  'inactive MANAGER cannot change Product availability'
);

reset role;

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000006"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000001',
      false
    )
  $$,
  '42501',
  'Product availability change is not allowed.',
  'authenticated identity without Profile cannot change Product availability'
);

reset role;

-- ---------------------------------------------------------------------------
-- Active KITCHEN
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select is(
  public.set_product_availability(
    '83000000-0000-4000-8000-000000000001',
    false
  ),
  false,
  'active KITCHEN receives the persisted unavailable state'
);

reset role;

select is(
  (
    select available
    from public.products
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  false,
  'KITCHEN availability change persists'
);

select is(
  (
    select availability_updated_by
    from public.products
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  '81000000-0000-4000-8000-000000000002'::uuid,
  'availability actor is derived from the authenticated KITCHEN identity'
);

select ok(
  (
    select availability_updated_at is not null
    from public.products
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  'availability timestamp is generated by PostgreSQL'
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select is(
  public.set_product_availability(
    '83000000-0000-4000-8000-000000000001',
    true
  ),
  true,
  'active KITCHEN receives the persisted available state'
);

reset role;

select is(
  (
    select available
    from public.products
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  true,
  'KITCHEN can restore Product availability'
);

-- ---------------------------------------------------------------------------
-- KITCHEN target boundary
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000002',
      false
    )
  $$,
  '42501',
  'Product availability change is not allowed.',
  'KITCHEN cannot change availability of an inactive Product'
);

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000003',
      false
    )
  $$,
  '42501',
  'Product availability change is not allowed.',
  'KITCHEN cannot change Product availability in an inactive Category'
);

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000099',
      false
    )
  $$,
  '42501',
  'Product availability change is not allowed.',
  'KITCHEN receives the same safe failure for a nonexistent Product'
);

reset role;

select results_eq(
  $$
    select
      id,
      available,
      availability_updated_at,
      availability_updated_by
    from public.products
    where id in (
      '83000000-0000-4000-8000-000000000002',
      '83000000-0000-4000-8000-000000000003'
    )
    order by id
  $$,
  $$
    values
      (
        '83000000-0000-4000-8000-000000000002'::uuid,
        true,
        null::timestamptz,
        null::uuid
      ),
      (
        '83000000-0000-4000-8000-000000000003'::uuid,
        true,
        null::timestamptz,
        null::uuid
      )
  $$,
  'denied KITCHEN calls leave restricted Products unchanged'
);

-- ---------------------------------------------------------------------------
-- Active MANAGER
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000004"}',
    true
  );
end
$$;

select lives_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000001',
      false
    )
  $$,
  'active MANAGER can change availability of an active Product'
);

reset role;

select is(
  (
    select available
    from public.products
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  false,
  'MANAGER availability change persists'
);

select is(
  (
    select availability_updated_by
    from public.products
    where id = '83000000-0000-4000-8000-000000000001'
  ),
  '81000000-0000-4000-8000-000000000004'::uuid,
  'availability actor is derived from the authenticated MANAGER identity'
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000004"}',
    true
  );
end
$$;

select lives_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000002',
      false
    )
  $$,
  'MANAGER can change availability of an inactive Product'
);

reset role;

select is(
  (
    select available
    from public.products
    where id = '83000000-0000-4000-8000-000000000002'
  ),
  false,
  'MANAGER availability change on inactive Product persists'
);

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000004"}',
    true
  );
end
$$;

select lives_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000003',
      false
    )
  $$,
  'MANAGER can change availability of a Product in an inactive Category'
);

reset role;

select is(
  (
    select available
    from public.products
    where id = '83000000-0000-4000-8000-000000000003'
  ),
  false,
  'MANAGER availability change in inactive Category persists'
);

-- ---------------------------------------------------------------------------
-- Same-value command still refreshes trusted metadata
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select lives_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000004',
      true
    )
  $$,
  'same-value availability request is a valid operational command'
);

reset role;

select is(
  (
    select available
    from public.products
    where id = '83000000-0000-4000-8000-000000000004'
  ),
  true,
  'same-value command preserves the requested availability'
);

select is(
  (
    select availability_updated_by
    from public.products
    where id = '83000000-0000-4000-8000-000000000004'
  ),
  '81000000-0000-4000-8000-000000000002'::uuid,
  'same-value command refreshes the trusted actor'
);

select ok(
  (
    select availability_updated_at > '2020-01-01 00:00:00+00'::timestamptz
    from public.products
    where id = '83000000-0000-4000-8000-000000000004'
  ),
  'same-value command refreshes the trusted timestamp'
);

-- ---------------------------------------------------------------------------
-- Invalid command input
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select throws_ok(
  $$
    select public.set_product_availability(
      '83000000-0000-4000-8000-000000000004',
      null
    )
  $$,
  '22023',
  'Product availability input is invalid.',
  'authorized caller cannot submit NULL availability'
);

reset role;

select is(
  (
    select available
    from public.products
    where id = '83000000-0000-4000-8000-000000000004'
  ),
  true,
  'rejected NULL availability leaves Product state unchanged'
);

-- ---------------------------------------------------------------------------
-- Direct-write regression
-- ---------------------------------------------------------------------------

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000004"}',
    true
  );
end
$$;

select throws_ok(
  $$
    update public.products
    set available = true
    where id = '83000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'MANAGER still cannot directly UPDATE available'
);

select throws_ok(
  $$
    update public.products
    set availability_updated_at = '1999-01-01 00:00:00+00'
    where id = '83000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'MANAGER still cannot directly UPDATE availability_updated_at'
);

select throws_ok(
  $$
    update public.products
    set availability_updated_by =
      '81000000-0000-4000-8000-000000000001'
    where id = '83000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'MANAGER still cannot directly UPDATE availability_updated_by'
);

reset role;

set local role authenticated;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000002"}',
    true
  );
end
$$;

select throws_ok(
  $$
    update public.products
    set available = false
    where id = '83000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  null,
  'KITCHEN still cannot directly UPDATE available'
);

reset role;

select * from finish();

rollback;