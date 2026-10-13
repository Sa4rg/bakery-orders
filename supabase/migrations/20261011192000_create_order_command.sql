-- M3-004A Create Order trusted command: successful atomic creation path.

create or replace function public.create_order(
  p_business_id uuid,
  p_requested_delivery_at timestamptz,
  p_customer_notes text,
  p_idempotency_key uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_order_id uuid;
  v_delivery_address text;

  v_item jsonb;
  v_product_id uuid;
  v_requested_quantity numeric;

  v_product_name text;
  v_unit_code text;
  v_quantity_step numeric(12,3);
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Order creation is not allowed.'
      using errcode = '42501';
  end if;

  -- Only an active CUSTOMER may create a customer Order.
  perform 1
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.active
    and profile.role = 'CUSTOMER'::public.app_role
  for share of profile;

  if not found then
    raise exception 'Order creation is not allowed.'
      using errcode = '42501';
  end if;

  if p_business_id is null
     or p_requested_delivery_at is null
     or p_idempotency_key is null
     or p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
  then
    raise exception 'Order input is invalid.'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'Order input is invalid.'
      using errcode = '22023';
  end if;

  -- business_id is only a selector supplied by the client.
  -- Authorization is established here from the authenticated identity.
  select business.delivery_address
  into v_delivery_address
  from public.business_memberships as membership
  join public.businesses as business
    on business.id = membership.business_id
  where membership.user_id = v_actor_id
    and membership.business_id = p_business_id
    and membership.active
    and business.active
  for share of membership, business;

  if not found then
    raise exception 'Order creation is not allowed.'
      using errcode = '42501';
  end if;

  insert into public.orders (
    business_id,
    created_by_user_id,
    status,
    requested_delivery_at,
    delivery_address_snapshot,
    customer_notes,
    idempotency_key
  )
  values (
    p_business_id,
    v_actor_id,
    'RECEIVED'::public.order_status,
    p_requested_delivery_at,
    v_delivery_address,
    p_customer_notes,
    p_idempotency_key
  )
  returning id into v_order_id;

  for v_item in
    select item.value
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
  loop
    v_product_id :=
      (v_item ->> 'product_id')::uuid;

    v_requested_quantity :=
      (v_item ->> 'requested_quantity')::numeric;

    -- Revalidate the mutable catalog at confirmation time.
    -- The row locks prevent a concurrent catalog mutation from changing the
    -- validated Product/Category before this transaction completes.
    select
      product.name,
      product.unit_code,
      product.quantity_step
    into
      v_product_name,
      v_unit_code,
      v_quantity_step
    from public.products as product
    join public.categories as category
      on category.id = product.category_id
    where product.id = v_product_id
      and product.active
      and product.available
      and category.active
    for share of product, category;

    if not found
       or v_requested_quantity is null
       or v_requested_quantity <= 0
       or pg_catalog.mod(
            v_requested_quantity,
            v_quantity_step
          ) <> 0
    then
      raise exception 'Order item is invalid.'
        using errcode = '22023';
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      unit_code_snapshot,
      quantity_step_snapshot,
      requested_quantity
    )
    values (
      v_order_id,
      v_product_id,
      v_product_name,
      v_unit_code,
      v_quantity_step,
      v_requested_quantity
    );
  end loop;

  insert into public.order_events (
    order_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    v_order_id,
    v_actor_id,
    'ORDER_CREATED',
    '{}'::jsonb
  );

  return v_order_id;
end;
$function$;

revoke execute
  on function public.create_order(
    uuid,
    timestamptz,
    text,
    uuid,
    jsonb
  )
  from public, anon;

grant execute
  on function public.create_order(
    uuid,
    timestamptz,
    text,
    uuid,
    jsonb
  )
  to authenticated;