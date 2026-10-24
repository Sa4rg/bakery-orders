-- M4-002A: publish production changes for Kitchen Realtime.
--
-- Supabase Realtime was enabled but its publication had no tables in the
-- verified M4-002A baseline. Keep existing RLS policies, SELECT grants and
-- DEFAULT replica identity; publish only INSERT/UPDATE changes.
--
-- Caution: publish operations are PUBLICATION-wide, not per-table. Abort if
-- unexpected tables have been published by another feature/environment;
-- do not change their behavior without explicit review.

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
      and puballtables = false
  ) then
    raise exception 'Expected explicit supabase_realtime publication not found';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and not (
        schemaname = 'public'
        and tablename in ('orders', 'order_items')
      )
  ) then
    raise exception 'Unexpected tables already in supabase_realtime; review before changing publication-wide operations';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    execute 'alter publication supabase_realtime add table public.order_items';
  end if;
end;
$migration$;

-- Keep the publication to the two change operations required by the queue.
-- Realtime does not RLS-filter DELETE events in the same way as INSERT/UPDATE.
alter publication supabase_realtime set (publish = 'insert, update');
