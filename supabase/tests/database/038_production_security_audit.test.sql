-- M4-010F: regression audit of SECURITY DEFINER boundaries, grants, and
-- browser direct-write denial. No migration or write privilege expansion.

begin;
select no_plan();

-- All production commands and the competing CUSTOMER cancellation command
-- use trusted PostgreSQL ownership and an empty search_path.
with signatures(sig) as (
  values
    ('public.start_order(uuid)'::text),
    ('public.record_prepared_quantity(uuid,numeric)'::text),
    ('public.record_unavailable_quantity(uuid,numeric,text)'::text),
    ('public.mark_order_ready(uuid)'::text),
    ('public.cancel_customer_order(uuid,text)'::text)
)
select ok(
  pg_catalog.to_regprocedure(sig) is not null,
  sig || ' exists'
)
from signatures;

with signatures(sig) as (
  values
    ('public.start_order(uuid)'::text),
    ('public.record_prepared_quantity(uuid,numeric)'::text),
    ('public.record_unavailable_quantity(uuid,numeric,text)'::text),
    ('public.mark_order_ready(uuid)'::text),
    ('public.cancel_customer_order(uuid,text)'::text)
)
select ok(
  p.prosecdef
    and p.proowner = 'postgres'::regrole
    and p.proconfig @> array['search_path=""']::text[],
  sig || ' uses postgres-owned SECURITY DEFINER with empty search_path'
)
from signatures
join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(sig);

with signatures(sig) as (
  values
    ('public.start_order(uuid)'::text),
    ('public.record_prepared_quantity(uuid,numeric)'::text),
    ('public.record_unavailable_quantity(uuid,numeric,text)'::text),
    ('public.mark_order_ready(uuid)'::text),
    ('public.cancel_customer_order(uuid,text)'::text)
)
select ok(
  not pg_catalog.has_function_privilege('anon', pg_catalog.to_regprocedure(sig), 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', pg_catalog.to_regprocedure(sig), 'EXECUTE'),
  sig || ' is executable by authenticated but not anon'
)
from signatures;

with protected(table_name) as (
  values ('orders'::text), ('order_items'::text), ('order_events'::text)
)
select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
    and not pg_catalog.has_any_column_privilege('authenticated', 'public.' || table_name, 'UPDATE'),
  table_name || ' has no authenticated direct-write grants (including column UPDATE)'
)
from protected;

with protected(table_name) as (
  values ('orders'::text), ('order_items'::text), ('order_events'::text)
)
select ok(
  c.relrowsecurity,
  table_name || ' has RLS enabled'
)
from protected
join pg_catalog.pg_class c on c.oid = ('public.' || table_name)::regclass;

-- Test actual SQL execution as the API role, not only catalog metadata.
set local role authenticated;
select throws_ok(
  $$update public.orders set status = 'READY' where id = '00000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated cannot update orders directly'
);
select throws_ok(
  $$update public.order_items set prepared_quantity = 1 where id = '00000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated cannot update order_items directly'
);
select throws_ok(
  $$insert into public.order_events (order_id, event_type, metadata) values ('00000000-0000-4000-8000-000000000001', 'ORDER_READY', '{}'::jsonb)$$,
  '42501', null, 'authenticated cannot forge an ORDER_READY event'
);
reset role;

select * from finish();
rollback;
