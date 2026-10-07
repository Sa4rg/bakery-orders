-- M2-001 category read authorization. Category writes are intentionally
-- unavailable to browser roles in this slice.

alter table public.categories enable row level security;

revoke all on table public.categories from anon, authenticated;
grant select on table public.categories to authenticated;

create policy categories_select_by_active_application_access
  on public.categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.active
        and (
          profile.role = 'MANAGER'
          or (
            categories.active
            and profile.role = 'KITCHEN'
          )
          or (
            categories.active
            and profile.role = 'CUSTOMER'
            and exists (
              select 1
              from public.business_memberships as membership
              join public.businesses as business
                on business.id = membership.business_id
              where membership.user_id = profile.id
                and membership.active
                and business.active
            )
          )
        )
    )
  );
