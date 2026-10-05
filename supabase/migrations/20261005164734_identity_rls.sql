-- M1 identity authorization: RLS and least-privilege grants for
-- profiles, businesses and business_memberships.
--
-- Policy dependency graph (no cycles, no SECURITY DEFINER required):
--   profiles <- business_memberships <- businesses

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;

-- Supabase default privileges grant broad access to client roles on new tables.
-- Remove them, then grant back only what this slice requires.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.businesses from anon, authenticated;
revoke all on table public.business_memberships from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.businesses to authenticated;
grant select on table public.business_memberships to authenticated;

-- A user reads only their own Profile, even when the Profile is inactive,
-- so the client can detect that application access is disabled.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- A user reads only their own memberships (including inactive ones), and only
-- while their Profile is active.
create policy business_memberships_select_own_active_profile
  on public.business_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles as p
      where p.id = (select auth.uid())
        and p.active
    )
  );

-- A user reads a Business only through an active membership held by an active
-- Profile. The Business itself may be inactive: historical visibility is kept.
create policy businesses_select_with_active_membership
  on public.businesses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.business_memberships as m
      join public.profiles as p on p.id = m.user_id
      where m.business_id = businesses.id
        and m.user_id = (select auth.uid())
        and m.active
        and p.active
    )
  );
