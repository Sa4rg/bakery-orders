-- M5-003: CUSTOMER Tracking reuses the M4 Realtime publication securely.
-- No new publication, grants, or customer access to order_events is required.
begin;
select no_plan();

select is((select puballtables from pg_catalog.pg_publication
  where pubname = 'supabase_realtime'), false,
  'publication retains its explicit table allowlist');

-- Compare catalog metadata as booleans/integers, not rows of text.
-- pgTAP results_eq(record, record) may raise an indeterminate collation
-- error when the two query outputs have different implicit collations.
select is(
  (select count(*)::integer from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'), 2,
  'publication contains exactly two tables across all schemas');
select ok(
  exists (select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'orders')
  and exists (select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'order_items'),
  'only public.orders and public.order_items are published');

select is((select pubinsert from pg_catalog.pg_publication
  where pubname = 'supabase_realtime'), true,
  'INSERT events remain available');
select is((select pubupdate from pg_catalog.pg_publication
  where pubname = 'supabase_realtime'), true,
  'UPDATE events remain available');
select is((select pubdelete from pg_catalog.pg_publication
  where pubname = 'supabase_realtime'), false,
  'DELETE is not published: no unsafe non-RLS-filtered events');
select is((select pubtruncate from pg_catalog.pg_publication
  where pubname = 'supabase_realtime'), false,
  'TRUNCATE is not published');

select is((select relrowsecurity from pg_catalog.pg_class
  where oid = 'public.orders'::pg_catalog.regclass), true,
  'orders RLS stays enabled');
select is((select relrowsecurity from pg_catalog.pg_class
  where oid = 'public.order_items'::pg_catalog.regclass), true,
  'order_items RLS stays enabled');

select is((select relreplident from pg_catalog.pg_class
  where oid = 'public.orders'::pg_catalog.regclass), 'd'::"char",
  'orders retains DEFAULT replica identity');
select is((select relreplident from pg_catalog.pg_class
  where oid = 'public.order_items'::pg_catalog.regclass), 'd'::"char",
  'order_items retains DEFAULT replica identity');

select ok(not has_table_privilege('anon', 'public.orders', 'SELECT'),
  'anon cannot SELECT orders');
select ok(not has_table_privilege('anon', 'public.order_items', 'SELECT'),
  'anon cannot SELECT order_items');
select ok(not exists (select 1 from pg_catalog.pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'order_events'),
  'private audit events are not published');

select * from finish();
rollback;
