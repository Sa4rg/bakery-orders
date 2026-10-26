-- M4-005: trusted, incremental recording of unavailable quantity.
--
-- Positive DELTA; never overwrite the cumulative amount or requested snapshot.
-- Each reduction requires an audit reason. No CUSTOMER approval is required.
-- All quantity arithmetic is exact numeric and the original quantity step is
-- enforced before converting to the numeric(12,3) storage column.
--
-- Lock order: actor Profile (FOR SHARE) -> Order (FOR UPDATE) ->
-- OrderItem (FOR UPDATE). Matches record_prepared_quantity and start_order.

create function public.record_unavailable_quantity(
  p_order_item_id uuid,
  p_quantity numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_reason text;
  v_order_id uuid;
  v_locked_item_order_id uuid;
  v_status public.order_status;
  v_requested_quantity numeric(12,3);
  v_prepared_quantity numeric(12,3);
  v_unavailable_quantity numeric(12,3);
  v_quantity_step_snapshot numeric(12,3);
  v_new_unavailable_quantity numeric(12,3);
  v_recorded_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Unavailable quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  if p_order_item_id is null then
    raise exception 'Order item id is required.'
      using errcode = '22023';
  end if;

  -- numeric arguments are intentionally unconstrained to prevent implicit
  -- rounding of >3 decimal-place inputs before validation.
  if p_quantity is null
     or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
     or p_quantity <= 0
     or pg_catalog.mod(p_quantity, 0.001::numeric) <> 0 then
    raise exception 'Unavailable quantity must be a positive, finite amount with at most three decimal places.'
      using errcode = '22023';
  end if;

  v_reason := pg_catalog.btrim(p_reason, E' \t\r\n');
  if v_reason is null or v_reason = '' then
    raise exception 'An unavailability reason is required.'
      using errcode = '22023';
  end if;

  -- Lock the active KITCHEN identity before accessing the Order.
  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.active
    and profile.role = 'KITCHEN'::public.app_role
  for share of profile;

  if not found then
    raise exception 'Unavailable quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  -- Read the parent id without taking an Item lock. This avoids an
  -- Item -> Order lock inversion with other production commands.
  select item.order_id
    into v_order_id
  from public.order_items as item
  where item.id = p_order_item_id;

  if not found then
    raise exception 'Unavailable quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  select orders.status
    into v_status
  from public.orders as orders
  where orders.id = v_order_id
  for update of orders;

  if not found then
    raise exception 'Unavailable quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  if v_status <> 'IN_PROGRESS'::public.order_status then
    raise exception 'Unavailable quantity may only be recorded for an IN_PROGRESS Order.'
      using errcode = '22023';
  end if;

  select
    item.order_id,
    item.requested_quantity,
    item.prepared_quantity,
    item.unavailable_quantity,
    item.quantity_step_snapshot
  into
    v_locked_item_order_id,
    v_requested_quantity,
    v_prepared_quantity,
    v_unavailable_quantity,
    v_quantity_step_snapshot
  from public.order_items as item
  where item.id = p_order_item_id
  for update of item;

  if not found or v_locked_item_order_id is distinct from v_order_id then
    raise exception 'Unavailable quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  if pg_catalog.mod(p_quantity, v_quantity_step_snapshot) <> 0 then
    raise exception 'Unavailable quantity must respect the original item quantity step.'
      using errcode = '22023';
  end if;

  if p_quantity > (
    v_requested_quantity - v_prepared_quantity - v_unavailable_quantity
  ) then
    raise exception 'Unavailable quantity exceeds the remaining unresolved quantity.'
      using errcode = '22023';
  end if;

  v_new_unavailable_quantity := v_unavailable_quantity + p_quantity;
  v_recorded_at := pg_catalog.clock_timestamp();

  update public.order_items
  set unavailable_quantity = v_new_unavailable_quantity,
      updated_at = v_recorded_at
  where id = p_order_item_id;

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
    v_order_id,
    p_order_item_id,
    v_actor_id,
    'QUANTITY_UNAVAILABLE',
    v_reason,
    pg_catalog.jsonb_build_object('unavailable_quantity', v_unavailable_quantity),
    pg_catalog.jsonb_build_object('unavailable_quantity', v_new_unavailable_quantity),
    pg_catalog.jsonb_build_object('quantity_delta', p_quantity),
    v_recorded_at
  );
end;
$function$;

alter function public.record_unavailable_quantity(uuid, numeric, text)
  owner to postgres;

revoke all on function public.record_unavailable_quantity(uuid, numeric, text)
  from public, anon;

grant execute on function public.record_unavailable_quantity(uuid, numeric, text)
  to authenticated;

comment on function public.record_unavailable_quantity(uuid, numeric, text) is
  'Records a positive, step-aligned increment of unavailable quantity for one IN_PROGRESS OrderItem, with a mandatory trimmed reason and an atomic QUANTITY_UNAVAILABLE audit event.';
