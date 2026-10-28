-- M4-003: trusted KITCHEN preparation start.
--
-- SECURITY DEFINER is justified because authenticated browser users have no
-- direct UPDATE privilege on orders or INSERT privilege on order_events.
-- This command enforces actor, lifecycle, audit and concurrency at the database.

create function public.start_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_status public.order_status;
  v_started_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Preparation start is not authorized.'
      using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.'
      using errcode = '22023';
  end if;

  -- Lock the active actor's Profile to avoid racing with deactivation.
  -- Keep the lock order actor Profile -> Order across production commands.
  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.active
    and profile.role = 'KITCHEN'::public.app_role
  for share of profile;

  if not found then
    raise exception 'Preparation start is not authorized.'
      using errcode = '42501';
  end if;

  -- The same Order row lock is used by cancel_customer_order.
  -- A concurrent cancellation / start cannot both pass the RECEIVED check.
  select o.status
    into v_status
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'Preparation start is not authorized.'
      using errcode = '42501';
  end if;

  if v_status <> 'RECEIVED'::public.order_status then
    raise exception 'Order cannot start preparation in its current state.'
      using errcode = '22023';
  end if;

  v_started_at := pg_catalog.clock_timestamp();

  update public.orders
  set status = 'IN_PROGRESS'::public.order_status,
      started_at = v_started_at,
      started_by_user_id = v_actor_id,
      updated_at = v_started_at
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
  ) values (
    p_order_id,
    null,
    v_actor_id,
    'PREPARATION_STARTED',
    null,
    pg_catalog.jsonb_build_object('status', 'RECEIVED'),
    pg_catalog.jsonb_build_object('status', 'IN_PROGRESS'),
    '{}'::jsonb,
    v_started_at
  );
end;
$function$;

alter function public.start_order(uuid) owner to postgres;

revoke all on function public.start_order(uuid) from public, anon;
grant execute on function public.start_order(uuid) to authenticated;

comment on function public.start_order(uuid) is
  'Starts a RECEIVED Order as an active KITCHEN actor, atomically persisting IN_PROGRESS, trusted metadata and PREPARATION_STARTED audit.';
