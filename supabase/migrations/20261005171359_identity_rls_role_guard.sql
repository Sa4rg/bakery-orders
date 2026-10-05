-- M1 identity RLS role guard.
-- Customer membership-based access additionally requires profiles.role = 'CUSTOMER'.
-- KITCHEN and MANAGER must gain broader access only through dedicated future
-- policies, never through a BusinessMembership row.
-- Policy names, targets and grants are unchanged.

alter policy business_memberships_select_own_active_profile
  on public.business_memberships
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles as p
      where p.id = (select auth.uid())
        and p.active
        and p.role = 'CUSTOMER'
    )
  );

alter policy businesses_select_with_active_membership
  on public.businesses
  using (
    exists (
      select 1
      from public.business_memberships as m
      join public.profiles as p on p.id = m.user_id
      where m.business_id = businesses.id
        and m.user_id = (select auth.uid())
        and m.active
        and p.active
        and p.role = 'CUSTOMER'
    )
  );
