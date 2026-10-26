-- M4-004: trusted, incremental recording of prepared quantity.
--
-- The input is a positive DELTA, not a replacement for the cumulative total.
-- All arithmetic uses exact numeric values, with no implicit rounding of
-- caller-supplied quantity to the order_items numeric(12,3) column type.
--
-- Lock order: actor Profile (FOR SHARE) -> Order (FOR UPDATE) ->
-- OrderItem (FOR UPDATE). M4-005 and M4-008 must preserve this order.
-- A failure aborts both the Item update and the audit write.

create function public.record_prepared_quantity(
  p_order_item_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_order_id uuid;
  v_locked_item_order_id uuid;
  v_status public.order_status;
  v_requested_quantity numeric(12,3);
  v_prepared_quantity numeric(12,3);
  v_unavailable_quantity numeric(12,3);
  v_quantity_step_snapshot numeric(12,3);
  v_new_prepared_quantity numeric(12,3);
  v_recorded_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'Prepared quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  if p_order_item_id is null then
    raise exception 'Order item id is required.'
      using errcode = '22023';
  end if;

  if p_quantity is null
     or p_quantity::text in ('NaN', 'Infinity', '-Infinity')
     or p_quantity <= 0
     or pg_catalog.mod(p_quantity, 0.001::numeric) <> 0 then
    raise exception 'Prepared quantity must be a positive, finite amount with at most three decimal places.'
      using errcode = '22023';
  end if;

  -- Match the Profile protection and ordering used by start_order.
  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.active
    and profile.role = 'KITCHEN'::public.app_role
  for share of profile;

  if not found then
    raise exception 'Prepared quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  -- Look up only the parent id without taking an Item lock. Locking the
  -- parent Order before its Item avoids Item->Order lock inversion.
  select i.order_id
    into v_order_id
  from public.order_items as i
  where i.id = p_order_item_id;

  if not found then
    raise exception 'Prepared quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  select o.status
    into v_status
  from public.orders as o
  where o.id = v_order_id
  for update of o;

  if not found then
    raise exception 'Prepared quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  if v_status <> 'IN_PROGRESS'::public.order_status then
    raise exception 'Prepared quantity may only be recorded for an IN_PROGRESS Order.'
      using errcode = '22023';
  end if;

  select
    i.order_id,
    i.requested_quantity,
    i.prepared_quantity,
    i.unavailable_quantity,
    i.quantity_step_snapshot
  into
    v_locked_item_order_id,
    v_requested_quantity,
    v_prepared_quantity,
    v_unavailable_quantity,
    v_quantity_step_snapshot
  from public.order_items as i
  where i.id = p_order_item_id
  for update of i;

  -- An Item that disappeared or changed parent during the first read must
  -- not be updated using a lock on a different Order.
  if not found or v_locked_item_order_id is distinct from v_order_id then
    raise exception 'Prepared quantity recording is not authorized.'
      using errcode = '42501';
  end if;

  if pg_catalog.mod(p_quantity, v_quantity_step_snapshot) <> 0 then
    raise exception 'Prepared quantity must respect the original item quantity step.'
      using errcode = '22023';
  end if;

  if p_quantity > (v_requested_quantity - v_prepared_quantity - v_unavailable_quantity) then
    raise exception 'Prepared quantity exceeds the remaining unresolved quantity.'
      using errcode = '22023';
  end if;

  v_new_prepared_quantity := v_prepared_quantity + p_quantity;
  v_recorded_at := pg_catalog.clock_timestamp();

  update public.order_items
  set prepared_quantity = v_new_prepared_quantity,
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
    'QUANTITY_PREPARED',
    null,
    pg_catalog.jsonb_build_object('prepared_quantity', v_prepared_quantity),
    pg_catalog.jsonb_build_object('prepared_quantity', v_new_prepared_quantity),
    pg_catalog.jsonb_build_object('quantity_delta', p_quantity),
    v_recorded_at
  );
end;
$function$;

alter function public.record_prepared_quantity(uuid, numeric) owner to postgres;

revoke all on function public.record_prepared_quantity(uuid, numeric)
  from public, anon;

grant execute on function public.record_prepared_quantity(uuid, numeric)
  to authenticated;

comment on function public.record_prepared_quantity(uuid, numeric) is
  'Records a positive, step-aligned increment of prepared quantity for one IN_PROGRESS OrderItem, atomically with a QUANTITY_PREPARED audit event.';
