-- M2-002 product read authorization. Browser roles are read-only in this slice.

alter table public.products enable row level security;

revoke all on table public.products from anon, authenticated;
grant select (
  id,
  category_id,
  name,
  description,
  unit_code,
  quantity_step,
  image_path,
  active,
  available,
  created_at,
  updated_at
) on table public.products to authenticated;

create policy products_select_by_active_application_access
  on public.products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as manager_profile
      where manager_profile.id = (select auth.uid())
        and manager_profile.active
        and manager_profile.role = 'MANAGER'
    )
    or (
      products.active
      and exists (
        select 1
        from public.categories as category
        where category.id = products.category_id
          and category.active
      )
      and exists (
        select 1
        from public.profiles as operational_profile
        where operational_profile.id = (select auth.uid())
          and operational_profile.active
          and (
            operational_profile.role = 'KITCHEN'
            or (
              operational_profile.role = 'CUSTOMER'
              and exists (
                select 1
                from public.business_memberships as membership
                join public.businesses as business
                  on business.id = membership.business_id
                where membership.user_id = operational_profile.id
                  and membership.active
                  and business.active
              )
            )
          )
      )
    )
  );
