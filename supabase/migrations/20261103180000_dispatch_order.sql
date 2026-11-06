-- M5-004: trusted KITCHEN READY -> DISPATCHED transition.
-- Lock hierarchy matches M4 production commands: active Profile (SHARE),
-- then Order (UPDATE). The Order lock serializes simultaneous dispatches.
-- No child quantity changes: M4 READY already validated fulfillment.

create function public.dispatch_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_status public.order_status;
  v_dispatched_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Dispatch is not authorized.' using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.' using errcode = '22023';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.active
    and profile.role = 'KITCHEN'::public.app_role
  for share of profile;

  if not found then
    raise exception 'Dispatch is not authorized.' using errcode = '42501';
  end if;

  select o.status into v_status
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'Dispatch is not authorized.' using errcode = '42501';
  end if;

  if v_status <> 'READY'::public.order_status then
    raise exception 'Only a READY Order can be dispatched.' using errcode = '22023';
  end if;

  -- A single server timestamp ties the persisted transition to its audit.
  v_dispatched_at := pg_catalog.clock_timestamp();

  update public.orders
  set status = 'DISPATCHED'::public.order_status,
      dispatched_at = v_dispatched_at,
      dispatched_by_user_id = v_actor_id,
      updated_at = v_dispatched_at
  where id = p_order_id;

  insert into public.order_events (
    order_id, order_item_id, actor_user_id, event_type, reason,
    previous_value, new_value, metadata, occurred_at
  ) values (
    p_order_id, null, v_actor_id, 'ORDER_DISPATCHED', null,
    pg_catalog.jsonb_build_object('status', 'READY'),
    pg_catalog.jsonb_build_object('status', 'DISPATCHED'),
    '{}'::jsonb, v_dispatched_at
  );
end;
$function$;

alter function public.dispatch_order(uuid) owner to postgres;
revoke all on function public.dispatch_order(uuid) from public, anon;
grant execute on function public.dispatch_order(uuid) to authenticated;

comment on function public.dispatch_order(uuid) is
  'Atomically transitions READY to DISPATCHED for an active KITCHEN actor; persists actor, server timestamp and a single ORDER_DISPATCHED event.';
