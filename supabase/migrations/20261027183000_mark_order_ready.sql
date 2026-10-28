-- M4-008: KITCHEN-only trusted transition IN_PROGRESS -> READY.
-- Fulfillment is derived from locked OrderItems, never trusted from the UI.
-- Lock order matches M4-003/004/005: Profile (SHARE) -> Order (UPDATE)
-- -> all OrderItems (UPDATE, ordered by id). READY and audit are atomic.

create function public.mark_order_ready(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_status public.order_status;
  v_item_count bigint;
  v_remaining numeric;
  v_total_prepared numeric;
  v_total_unavailable numeric;
  v_condition text;
  v_ready_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Marking an Order ready is not authorized.'
      using errcode = '42501';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required.'
      using errcode = '22023';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.active
    and profile.role = 'KITCHEN'::public.app_role
  for share of profile;

  if not found then
    raise exception 'Marking an Order ready is not authorized.'
      using errcode = '42501';
  end if;

  select orders.status
    into v_status
  from public.orders as orders
  where orders.id = p_order_id
  for update of orders;

  if not found then
    raise exception 'Marking an Order ready is not authorized.'
      using errcode = '42501';
  end if;

  if v_status <> 'IN_PROGRESS'::public.order_status then
    raise exception 'Only an IN_PROGRESS Order may be marked READY.'
      using errcode = '22023';
  end if;

  -- Lock every child before reading aggregate values. Together with the
  -- parent lock (also taken by both quantity RPCs), this serializes READY
  -- against further quantity recording, with a deterministic item order.
  perform 1
  from public.order_items as item
  where item.order_id = p_order_id
  order by item.id
  for update of item;

  if not found then
    raise exception 'An Order without items cannot be marked READY.'
      using errcode = '22023';
  end if;

  select
    pg_catalog.count(*),
    coalesce(pg_catalog.sum(
      item.requested_quantity - item.prepared_quantity - item.unavailable_quantity
    ), 0),
    coalesce(pg_catalog.sum(item.prepared_quantity), 0),
    coalesce(pg_catalog.sum(item.unavailable_quantity), 0)
    into v_item_count, v_remaining, v_total_prepared, v_total_unavailable
  from public.order_items as item
  where item.order_id = p_order_id;

  if v_item_count = 0 or v_remaining <> 0 then
    raise exception 'All OrderItem quantities must be resolved before READY.'
      using errcode = '22023';
  end if;

  if v_total_prepared <= 0 then
    raise exception 'A fully unavailable Order cannot be marked READY.'
      using errcode = '22023';
  end if;

  -- This label is audit metadata, not a persisted fulfillment state.
  v_condition := case
    when v_total_unavailable = 0 then 'COMPLETE'
    else 'PARTIAL'
  end;
  v_ready_at := pg_catalog.clock_timestamp();

  update public.orders
  set status = 'READY'::public.order_status,
      ready_at = v_ready_at,
      ready_by_user_id = v_actor_id,
      updated_at = v_ready_at
  where id = p_order_id;

  insert into public.order_events (
    order_id, order_item_id, actor_user_id, event_type, reason,
    previous_value, new_value, metadata, occurred_at
  ) values (
    p_order_id, null, v_actor_id, 'ORDER_READY', null,
    pg_catalog.jsonb_build_object('status', 'IN_PROGRESS'),
    pg_catalog.jsonb_build_object('status', 'READY'),
    pg_catalog.jsonb_build_object(
      'fulfillment_condition', v_condition,
      'prepared_quantity', v_total_prepared,
      'unavailable_quantity', v_total_unavailable
    ),
    v_ready_at
  );
end;
$function$;

alter function public.mark_order_ready(uuid) owner to postgres;
revoke all on function public.mark_order_ready(uuid) from public, anon;
grant execute on function public.mark_order_ready(uuid) to authenticated;

comment on function public.mark_order_ready(uuid) is
  'Atomically marks an IN_PROGRESS Order READY for active KITCHEN when all items are resolved and prepared total > 0, recording ORDER_READY with trusted metadata.';
