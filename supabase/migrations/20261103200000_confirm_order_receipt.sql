-- M5-005: CUSTOMER confirms physical receipt of its Business's DISPATCHED Order.
-- SECURITY DEFINER is required: authenticated has no direct Order UPDATE or
-- OrderEvent INSERT. Lock order follows Profile (SHARE) -> Order (UPDATE).
-- An active membership is locked (SHARE) and rechecked before mutation so
-- revocation cannot slip between authorization and the commit.

create function public.confirm_order_receipt(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_status public.order_status;
  v_business_id uuid;
  v_delivered_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Receipt confirmation is not authorized.' using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.' using errcode = '22023';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.active
    and profile.role = 'CUSTOMER'::public.app_role
  for share of profile;

  if not found then
    raise exception 'Receipt confirmation is not authorized.' using errcode = '42501';
  end if;

  -- Only lock an Order visible to the caller's active membership. Foreign
  -- and nonexistent identifiers have identical behavior (SQLSTATE 42501).
  select o.status, o.business_id into v_status, v_business_id
  from public.orders as o
  where o.id = p_order_id
    and exists (
      select 1 from public.business_memberships as membership
      where membership.user_id = v_actor_id
        and membership.business_id = o.business_id
        and membership.active
    )
  for update of o;

  if not found then
    raise exception 'Receipt confirmation is not authorized.' using errcode = '42501';
  end if;

  -- Lock and revalidate mutable authorization after locking the Order.
  perform 1
  from public.business_memberships as membership
  where membership.user_id = v_actor_id
    and membership.business_id = v_business_id
    and membership.active
  for share of membership;

  if not found then
    raise exception 'Receipt confirmation is not authorized.' using errcode = '42501';
  end if;

  if v_status <> 'DISPATCHED'::public.order_status then
    raise exception 'Only a DISPATCHED Order can be confirmed received.'
      using errcode = '22023';
  end if;

  v_delivered_at := pg_catalog.clock_timestamp();

  update public.orders
  set status = 'DELIVERED'::public.order_status,
      delivered_at = v_delivered_at,
      delivered_by_user_id = v_actor_id,
      updated_at = v_delivered_at
  where id = p_order_id;

  insert into public.order_events (
    order_id, order_item_id, actor_user_id, event_type, reason,
    previous_value, new_value, metadata, occurred_at
  ) values (
    p_order_id, null, v_actor_id, 'ORDER_DELIVERED', null,
    pg_catalog.jsonb_build_object('status', 'DISPATCHED'),
    pg_catalog.jsonb_build_object('status', 'DELIVERED'),
    '{}'::jsonb, v_delivered_at
  );
end;
$function$;

alter function public.confirm_order_receipt(uuid) owner to postgres;
revoke all on function public.confirm_order_receipt(uuid) from public, anon;
grant execute on function public.confirm_order_receipt(uuid) to authenticated;

comment on function public.confirm_order_receipt(uuid) is
  'Atomically confirms DISPATCHED -> DELIVERED by an active CUSTOMER member of the Order Business, with server actor, timestamp and a single ORDER_DELIVERED event.';
