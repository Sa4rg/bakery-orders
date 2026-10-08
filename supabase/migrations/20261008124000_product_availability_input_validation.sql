-- M2-007 Product availability command input validation.
--
-- Reject NULL availability explicitly at the trusted command boundary instead
-- of leaking the underlying products.available NOT NULL constraint failure.

create or replace function public.set_product_availability(
  p_product_id uuid,
  p_available boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.app_role;
  actor_active boolean;
  affected_rows integer;
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
    );

  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    raise exception 'Product availability change is not allowed.'
      using errcode = '42501';
  end if;
end;
$$;