-- M3-002E OrderItem read authorization and direct-write boundary.

alter table public.order_items enable row level security;

-- Supabase may grant broad Data API privileges to new tables.
-- Remove them and explicitly restore read-only authenticated access.
revoke all on table public.order_items from anon, authenticated;

grant select on table public.order_items to authenticated;

create policy order_items_select_through_authorized_order
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders as authorized_order
      where authorized_order.id = order_items.order_id
    )
  );