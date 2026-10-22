-- M4-001B: narrow KITCHEN read projection for establishment names.
--
-- Direct SELECT on businesses remains CUSTOMER-membership scoped.
-- KITCHEN requires business names for production Orders but must not acquire
-- access to private Business contact and administration columns.
--
-- V1 models one bakery: an active KITCHEN profile may read operational Orders
-- across its Businesses. Limit this projection to Businesses with an Order.
-- If multiple bakery tenants are introduced, add a trusted tenant predicate to
-- this function and to the existing Orders RLS policy before multi-tenant use.
--
-- SECURITY DEFINER is justified because the caller cannot directly SELECT
-- businesses under existing RLS. The function checks application authorization
-- itself and returns only the two approved fields.

create function public.get_kitchen_order_business_names(
  p_business_ids uuid[]
)
returns table (
  id uuid,
  name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_actor_id
      and profile.active
      and profile.role = 'KITCHEN'::public.app_role
  ) then
    raise exception 'Kitchen business lookup is not authorized.'
      using errcode = '42501';
  end if;

  if p_business_ids is null
     or pg_catalog.cardinality(p_business_ids) > 100
     or exists (
       select 1
       from pg_catalog.unnest(p_business_ids) as requested(business_id)
       where requested.business_id is null
     ) then
    raise exception 'Kitchen business lookup input is invalid.'
      using errcode = '22023';
  end if;

  -- No direct customer membership requirement: KITCHEN is bakery-wide in V1.
  -- A Business with no persisted Order must not be enumerated by this helper.
  return query
    select business.id, business.name
    from public.businesses as business
    where business.id = any (p_business_ids)
      and exists (
        select 1
        from public.orders as production_order
        where production_order.business_id = business.id
      )
    order by business.id;
end;
$$;

alter function public.get_kitchen_order_business_names(uuid[])
  owner to postgres;

revoke all on function public.get_kitchen_order_business_names(uuid[])
  from public, anon;

grant execute on function public.get_kitchen_order_business_names(uuid[])
  to authenticated;

comment on function public.get_kitchen_order_business_names(uuid[]) is
  'Returns only (id, name) of Businesses with Orders to active KITCHEN profiles for the V1 single-bakery production read model.';
