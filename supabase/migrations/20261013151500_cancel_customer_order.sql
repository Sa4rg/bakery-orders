-- M3-010: CUSTOMER cancellation command.
--
-- This is intentionally customer-specific. Manager cancellation has different
-- lifecycle authorization and remains a later capability.
--
-- SECURITY DEFINER is required because normal authenticated users do not have
-- direct UPDATE/INSERT privileges on orders/order_events. The function therefore
-- validates authentication, role, membership and lifecycle internally.

create or replace function public.cancel_customer_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_status public.order_status;
  v_reason text;
  v_cancelled_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Cancellation is not authorized.'
      using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.'
      using errcode = '22023';
  end if;

  v_reason := pg_catalog.btrim(p_reason);

  if p_reason is null or v_reason = '' then
    raise exception 'Cancellation reason is required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles as p
    where p.id = v_actor_id
      and p.active
      and p.role = 'CUSTOMER'::public.app_role
  ) then
    raise exception 'Cancellation is not authorized.'
      using errcode = '42501';
  end if;

  /*
   * Lock the authoritative Order row before validating its lifecycle state.
   *
   * Future start_order(...) will operate on this same state boundary, so this
   * prevents cancellation from relying on stale UI state during concurrent
   * lifecycle operations.
   */
  select o.status
    into v_status
  from public.orders as o
  where o.id = p_order_id
    and exists (
      select 1
      from public.business_memberships as m
      where m.user_id = v_actor_id
        and m.business_id = o.business_id
        and m.active
    )
  for update of o;

  /*
   * Missing and unauthorized Orders intentionally produce the same result.
   * Do not reveal whether an unrelated Order identifier exists.
   */
  if not found then
    raise exception 'Cancellation is not authorized.'
      using errcode = '42501';
  end if;

  if v_status <> 'RECEIVED'::public.order_status then
    raise exception 'Order cannot be cancelled in its current state.'
      using errcode = '22023';
  end if;

  v_cancelled_at := pg_catalog.clock_timestamp();

  update public.orders
  set
    status = 'CANCELLED'::public.order_status,
    cancelled_at = v_cancelled_at,
    cancelled_by_user_id = v_actor_id,
    cancellation_reason = v_reason,
    updated_at = v_cancelled_at
  where id = p_order_id;

  insert into public.order_events (
    order_id,
    order_item_id,
    actor_user_id,
    event_type,
    reason,
    previous_value,
    new_value,
    metadata,
    occurred_at
  )
  values (
    p_order_id,
    null,
    v_actor_id,
    'ORDER_CANCELLED',
    v_reason,
    pg_catalog.jsonb_build_object(
      'status',
      'RECEIVED'
    ),
    pg_catalog.jsonb_build_object(
      'status',
      'CANCELLED'
    ),
    '{}'::jsonb,
    v_cancelled_at
  );
end;
$$;

alter function public.cancel_customer_order(uuid, text)
  owner to postgres;

revoke all
  on function public.cancel_customer_order(uuid, text)
  from public, anon;

grant execute
  on function public.cancel_customer_order(uuid, text)
  to authenticated;

comment on function public.cancel_customer_order(uuid, text) is
  'Cancels a RECEIVED Order for an active CUSTOMER with an active membership in the Order Business.';