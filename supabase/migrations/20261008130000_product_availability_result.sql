-- M2-007 Product availability command persisted result.
--
-- The trusted command returns the availability value persisted by PostgreSQL,
-- while continuing to expose no internal audit metadata.

drop function public.set_product_availability(uuid, boolean);

create function public.set_product_availability(
  p_product_id uuid,
  p_available boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.app_role;
  actor_active boolean;
  persisted_available boolean;
begin
  actor_id := auth.uid();

  if actor_id is null then
    raise exception 'Product availability change is not allowed.'
      using errcode = '42501';
  end if;

  select profile.role, profile.active
    into actor_role, actor_active
  from public.profiles as profile
  where profile.id = actor_id;

  if actor_role is null
     or actor_active is not true
     or actor_role not in ('KITCHEN', 'MANAGER') then
    raise exception 'Product availability change is not allowed.'
      using errcode = '42501';
  end if;

  if p_available is null then
    raise exception 'Product availability input is invalid.'
      using errcode = '22023';
  end if;

  update public.products as product
  set
    available = p_available,
    availability_updated_at = statement_timestamp(),
    availability_updated_by = actor_id
  where product.id = p_product_id
    and (
      actor_role = 'MANAGER'
      or (
        actor_role = 'KITCHEN'
        and product.active
        and exists (
          select 1
          from public.categories as category
          where category.id = product.category_id
            and category.active
        )
      )
    )
  returning product.available
    into persisted_available;

  if not found then
    raise exception 'Product availability change is not allowed.'
      using errcode = '42501';
  end if;

  return persisted_available;
end;
$$;

revoke all on function public.set_product_availability(uuid, boolean)
  from public;

revoke all on function public.set_product_availability(uuid, boolean)
  from anon;

grant execute on function public.set_product_availability(uuid, boolean)
  to authenticated;