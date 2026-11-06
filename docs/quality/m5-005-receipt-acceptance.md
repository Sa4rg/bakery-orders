# M5-005 — Trusted CUSTOMER receipt confirmation

## Goal

Complete the normal Order lifecycle by allowing an authorized CUSTOMER of the
receiving Business to confirm physical receipt: `DISPATCHED -> DELIVERED`.
No courier role, delivery dispute, return workflow or additional delivery table
is introduced in M5-005.

## Trust boundary

- The browser only supplies an Order UUID to `confirm_order_receipt(uuid)`.
- The `SECURITY DEFINER` function has fixed empty `search_path`, postgres
  ownership and authenticated-only EXECUTE. The caller cannot directly update
  Orders or insert OrderEvents.
- The function verifies the JWT subject's active CUSTOMER Profile, then an
  active membership **in the Order's Business**. The Customer who originally
  created the Order does not have exclusive receipt rights.
- It locks the Order (`FOR UPDATE`) and the qualifying membership (`FOR SHARE`).
  The latter prevents a concurrent revocation from completing between its
  validation and the receipt commit. The Profile is locked first (`FOR SHARE`).
- Foreign and missing Order UUIDs are intentionally indistinguishable (`42501`).
  Authenticated actors with access but an invalid lifecycle receive `22023`.
- A single transaction updates status, `delivered_at`,
  `delivered_by_user_id`, `updated_at` and creates exactly one
  `ORDER_DELIVERED` event with matching server-derived actor and time.
- A second attempt, including a concurrent request, is rejected. No automatic
  retry is allowed for uncertain network outcomes.
- Existing fulfillment amounts, snapshots, READY/DISPATCHED metadata and
  shortage reasons remain immutable.

## Browser behavior

- The receipt command is composed into the existing CUSTOMER Tracking detail.
- Only a freshly loaded `DISPATCHED` Order shows the two-step physical receipt
  confirmation; it is never available for other statuses or other user roles.
- The first click is nonmutating. The second submits one RPC. While pending or
  awaiting an authoritative read, another submission is blocked.
- After every RPC outcome, including an ambiguous error, the client refreshes
  the persisted Order before allowing another decision. Terminal Order details
  remain retrievable by ID through existing RLS after leaving the active list.
- M5-003 Realtime still invalidates via persisted Order changes; no extra
  Realtime table or RLS policy is added.

## Tests

- `043_confirm_order_receipt.test.sql`: function privileges, COMPLETE/PARTIAL,
  colleague of the same Business, exact actor/timestamps/event and preservation.
- `044_confirm_order_receipt_security.test.sql`: wrong Business, invalid states,
  inactive/missing Profile/membership, revoked membership, KITCHEN/MANAGER/anon.
- `createSupabaseCustomerReceiptGateway.test.ts`: local UUID validation, nil
  UUID, one RPC call, safe errors without retries.
- `CustomerTrackingBoard.receipt.test.tsx`: two-step confirmation, cancelled
  prompt, no action on other states, uncertain outcomes, pending duplicate guard.
- `customer-receipt.spec.ts`: real JWT complete and partial orders, denial of
  foreign/unauthorized roles, server audit, concurrent requests.
- `customer-receipt-ui.spec.ts`: real CUSTOMER browser, persist/refetch,
  unauthorized audit reads, reload of terminal Order.
- Full regression, typecheck, lint, build, pgTAP and real JWT E2E must be run
  by the user before any commit.

## Deferred

M5-006: broader adversarial tests (including membership revocation races with
multiple concurrent actor sessions). M5-007: critical end-to-end lifecycle
acceptance. M5-008: consolidated partial-fulfillment end-to-end regression.
