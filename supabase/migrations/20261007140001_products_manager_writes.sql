-- M2-006A Product administration is limited to active MANAGER Profiles.
-- Availability, image and trusted metadata remain outside this write boundary.

grant insert (
  category_id,
  name,
  description,
  unit_code,
  quantity_step,
  active,
  available
) on table public.products to authenticated;

grant update (
  category_id,
  name,
  description,
  unit_code,
  quantity_step,
  active
) on table public.products to authenticated;

create policy products_insert_active_manager
  on public.products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.active
        and profile.role = 'MANAGER'
    )
  );

create policy products_update_active_manager
  on public.products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.active
        and profile.role = 'MANAGER'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.active
        and profile.role = 'MANAGER'
    )
  );
