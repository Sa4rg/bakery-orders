-- M3-001E Order read authorization and direct-write boundary.

alter table public.orders enable row level security;

-- New Supabase tables may inherit broad client privileges.
-- Remove them first, then grant back only the read capability required here.
revoke all on table public.orders from anon, authenticated;
revoke all on sequence public.orders_order_number_seq from anon, authenticated;

grant select on table public.orders to authenticated;

create policy orders_select_authorized_roles
  on public.orders
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.active
        and (
          profile.role in ('KITCHEN', 'MANAGER')
          or (
            profile.role = 'CUSTOMER'
            and exists (
              select 1
              from public.business_memberships as membership
              where membership.user_id = profile.id
                and membership.business_id = orders.business_id
                and membership.active
            )
          )
        )
    )
  );