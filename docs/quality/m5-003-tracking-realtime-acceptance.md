# M5-003 — CUSTOMER Tracking Realtime

## Scope and acceptance

An authorized CUSTOMER sees persisted Order and OrderItem changes without
reloading the page. A reconnect performs an unconditional authorized read,
recovering any changes missed while the channel was disconnected. All channels
are stopped on logout, selection changes, and unmount.

## Existing infrastructure reused

- M4-002 already publishes `orders` and `order_items` (`INSERT`, `UPDATE` only).
  We do **not** add a migration, publication, or new SELECT permission.
- `order_events` is *not* published; the M5-002 restricted shortage-reasons RPC
  remains the only CUSTOMER-facing historical reason projection.
- The M4 Kitchen Realtime adapter now delegates to a small, shared,
  signal-only Supabase transport; the M4 Kitchen application synchronizer and
  its public API are unchanged.

## Security boundary

- A CUSTOMER Orders subscription is filtered to the Business supplied by the
  authenticated shell; item subscriptions are filtered to the selected Order.
- Those filters reduce noise. **PostgreSQL RLS is authoritative**, and a
  forged Business or Order identifier never grants access.
- The transport discards all Postgres Changes payloads; React never renders
  payload values or forwards audit internals. Every update causes a fresh
  PostgREST read under the same CUSTOMER JWT.
- No service-role browser client, mutation retry or delivery workflow added.

## Lifecycle

- Initial `SUBSCRIBED` always requests a refresh, closing the race between
  initial read and channel join.
- INSERT/UPDATE signals are debounced; an event while a read is in flight
  changes the request key and invalidates that older result.
- During disconnection, the screen displays a possibly-outdated warning.
  Re-SUBSCRIBED forces a fresh read even if no events arrived during downtime.
- Manual refresh remains available when the channel is down.
- Changing the selected Order replaces the channel with one scoped to that
  OrderItem set. Leaving a detail removes those listeners. Logout/unmount
  disposes the channel and ignores late events and read responses.
- On invalidation, the active list resets to page 1 because adding/removing
  Orders can invalidate older keyset cursors.

## Test gates

- `src/features/tracking/application/customerTrackingSynchronization.test.ts`:
  invalidation debounce, reconnect, missed events, cleanup and manual reads.
- `src/features/tracking/data/createSupabaseCustomerTrackingRealtimeGateway.test.ts`:
  four permitted event registrations for detail, two Business-scoped
  registrations for list, connection statuses, and late-callback suppression.
- `src/features/tracking/components/CustomerTrackingBoard.realtime.test.tsx`:
  visible persisted changes, reconnect, channel replacement and unmount.
- `src/app/KitchenProductionWiring.test.tsx`:
  only CUSTOMER subscribes to Tracking; sign-out removes listeners.
- `supabase/tests/database/040_customer_tracking_realtime_publication.test.sql`:
  unchanged publication allowlist, RLS, replica identity and operation flags.
- `e2e/customer-tracking-realtime.spec.ts`:
  real CUSTOMER JWT and browser updates from trusted KITCHEN mutations without
  pressing Refresh; forged cross-Business subscriptions do not receive WAL
  events, and joining after a disconnect refetches the current saved status.
- Complete M4/M5-001/M5-002 regression remains required before review/commit.

## Out of scope

M5-004 dispatch, M5-005 delivery confirmation, notifications, OTP, couriers,
GPS, and M7 historical browsing remain unchanged.
