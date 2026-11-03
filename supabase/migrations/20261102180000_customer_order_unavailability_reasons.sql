-- M5-002A: narrow CUSTOMER-facing projection of historical shortages.
--
-- order_events remains private to KITCHEN/MANAGER under its existing RLS.
-- This read-only SECURITY DEFINER function exposes only reason, item identity,
-- and occurrence time, and only for Orders of the caller's active Business.
-- A foreign Order is indistinguishable from an unknown Order (zero rows).

create function public.get_customer_order_unavailability_reasons(p_order_id uuid)
returns table (
  order_item_id uuid,
  reason text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not exists (
    select 1
    from public.profiles as p
    where p.id = v_actor_id
      and p.active
      and p.role = 'CUSTOMER'::public.app_role
      and exists (
        select 1 from public.business_memberships as m
        where m.user_id = p.id and m.active
      )
  ) then
    raise exception 'Customer shortage lookup is not authorized.'
      using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.' using errcode = '22023';
  end if;

  return query
    select e.order_item_id, e.reason, e.occurred_at
    from public.orders as o
    join public.order_events as e on e.order_id = o.id
    join public.order_items as item on item.id = e.order_item_id
      and item.order_id = o.id
    where o.id = p_order_id
      and exists (
        select 1
        from public.business_memberships as m
        where m.user_id = v_actor_id
          and m.business_id = o.business_id
          and m.active
      )
      and e.event_type = 'QUANTITY_UNAVAILABLE'
      and e.reason is not null
      and pg_catalog.btrim(e.reason) <> ''
    order by e.occurred_at, e.id;
end;
$function$;

alter function public.get_customer_order_unavailability_reasons(uuid)
  owner to postgres;

revoke all on function public.get_customer_order_unavailability_reasons(uuid)
  from public, anon;

grant execute on function public.get_customer_order_unavailability_reasons(uuid)
  to authenticated;

comment on function public.get_customer_order_unavailability_reasons(uuid) is
  'Returns only (order_item_id, reason, occurred_at) of QUANTITY_UNAVAILABLE events for an active CUSTOMER with active membership in the receiving Business.';
