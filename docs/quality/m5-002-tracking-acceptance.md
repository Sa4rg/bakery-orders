# M5-002 — CUSTOMER Tracking UI acceptance

## Purpose

Make persisted Order progress visible to an authorized CUSTOMER without
introducing Realtime subscriptions (M5-003), dispatch (M5-004), delivery
confirmation (M5-005), or the navigable history product (M7).

## Read boundaries

- `CustomerTrackingQueryGateway` from M5-001 owns active-Order pagination
  and authorized individual Order reads under existing RLS.
- `get_customer_order_unavailability_reasons(uuid)` is a narrow read-only
  `SECURITY DEFINER` function. Its result exposes only the historical
  `order_item_id`, shortage `reason`, and `occurred_at`.
- The function checks the active CUSTOMER profile and active membership in
  the Order's receiving Business inside PostgreSQL. Foreign and nonexistent
  Orders both return zero rows.
- Direct CUSTOMER SELECT on `order_events` remains blocked. The function
  does not leak audit actors, metadata, prior values or unrelated event types.
- The browser only calls read gateways; no service-role key is used.

## UI contract

- The CUSTOMER shell displays active orders with status, requested delivery
  and a link to details. Pages use the existing keyset cursor contract.
- A known Order ID can be opened with RLS; this also makes an authorized
  terminal Order accessible without inventing M7 history browsing.
- Detail reads the authoritative saved state, item snapshots and integer
  thousandths; shortages show the historical event reasons per item.
- A manual refresh re-reads persisted state. Realtime integration belongs
  exclusively to M5-003; no UI text claims live updates yet.
- Missing and forbidden Order IDs have identical UI messaging. The interface
  sanitizes data/provider failures and ignores responses after unmount.

## Verification

- `supabase/tests/database/039_customer_shortage_reasons.test.sql`:
  function shape, EXECUTE privileges, active role and membership, cross-
  Business isolation, missing/foreign nonenumeration and unchanged RLS.
- `src/features/tracking/data/createSupabaseCustomerShortageReasonsGateway.test.ts`:
  projected data integrity and sanitized errors.
- `src/features/tracking/components/CustomerTrackingBoard.test.tsx`:
  list, detail, amounts, reasons, cursor navigation, manual refresh,
  inaccessible Order, missing reason handling and stale response disposal.
- `src/shared/domain/formatQuantityThousandths.test.ts`:
  exact presentation of stored integer thousandths.
- `e2e/customer-shortage-reasons.spec.ts`:
  real JWT/RLS and trusted shortage writes with no audit table widening.
- `e2e/customer-tracking-ui.spec.ts`:
  authenticated CUSTOMER browser and persisted KITCHEN changes with explicit
  refresh, plus a foreign-Order lookup that does not disclose private data.

## Scope boundary

This slice does **not** add a Delivery entity, expose internal audit events,
change Order state, or grant direct writes. M5-003 will add Realtime
invalidations followed by a fresh authorized query. M5-004/005 will own
trusted dispatch and receipt commands.
