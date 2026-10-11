-- M3-003C OrderEvent read authorization and append-only browser boundary.

alter table public.order_events enable row level security;

-- Do not rely on Supabase default table grants for audit data.
revoke all on table public.order_events from anon, authenticated;

grant select on table public.order_events to authenticated;

create policy order_events_select_operational_roles
  on public.order_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.active
        and profile.role in ('KITCHEN', 'MANAGER')
    )
  );