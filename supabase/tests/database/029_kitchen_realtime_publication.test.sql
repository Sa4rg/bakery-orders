-- M4-002A: publication configuration for the Kitchen production queue.
-- This test checks publication metadata; delivery and RLS behavior will be
-- exercised with real authenticated subscriptions in M4-002E.

begin;

select no_plan();

select ok(
  exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ),
  'Supabase Realtime publication exists'
);

select is(
  (
    select puballtables
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ),
  false,
  'publication has an explicit table allowlist'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ),
  'orders is published to Supabase Realtime'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ),
  'order_items is published to Supabase Realtime'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_events'
  ),
  'order_events is not published'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ),
  'product availability is not changed by M4-002'
);

select is(
  (
    select pubinsert from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ),
  true,
  'INSERT is published'
);

select is(
  (
    select pubupdate from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ),
  true,
  'UPDATE is published'
);

select is(
  (
    select pubdelete from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ),
  false,
  'DELETE is not published (DELETE changes are not RLS-filtered by Realtime)'
);

select is(
  (
    select pubtruncate from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ),
  false,
  'TRUNCATE is not published'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.orders'::pg_catalog.regclass
  ),
  true,
  'orders still has RLS enabled'
);

select is(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.order_items'::pg_catalog.regclass
  ),
  true,
  'order_items still has RLS enabled'
);

select is(
  (
    select relreplident
    from pg_catalog.pg_class
    where oid = 'public.orders'::pg_catalog.regclass
  ),
  'd'::"char",
  'orders retains DEFAULT replica identity'
);

select is(
  (
    select relreplident
    from pg_catalog.pg_class
    where oid = 'public.order_items'::pg_catalog.regclass
  ),
  'd'::"char",
  'order_items retains DEFAULT replica identity'
);

select ok(
  not has_table_privilege('anon', 'public.orders', 'SELECT'),
  'anon cannot SELECT orders'
);

select ok(
  not has_table_privilege('anon', 'public.order_items', 'SELECT'),
  'anon cannot SELECT order_items'
);

select ok(
  has_table_privilege('authenticated', 'public.orders', 'SELECT'),
  'authenticated retains SELECT grant on orders (RLS determines rows)'
);

select ok(
  has_table_privilege('authenticated', 'public.order_items', 'SELECT'),
  'authenticated retains SELECT grant on order_items (RLS determines rows)'
);

select * from finish();

rollback;
