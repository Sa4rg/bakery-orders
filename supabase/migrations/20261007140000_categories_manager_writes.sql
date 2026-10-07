-- M2-006A Category administration is limited to active MANAGER Profiles.

grant insert (name, description, active, display_order)
  on table public.categories to authenticated;

grant update (name, description, active, display_order)
  on table public.categories to authenticated;

create policy categories_insert_active_manager
  on public.categories
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

create policy categories_update_active_manager
  on public.categories
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
