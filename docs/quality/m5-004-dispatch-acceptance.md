# M5-004 — Trusted Dispatch Order

## Scope

KITCHEN may confirm that an Order in `READY` has left production. The trusted
`public.dispatch_order(uuid)` command changes it to `DISPATCHED`, persisting
`dispatched_by_user_id` from `auth.uid()` and `dispatched_at` from the database.
The transition and its `ORDER_DISPATCHED` audit event are one atomic transaction.

Dispatch **does not** calculate new fulfillment, change OrderItems, confirm
DELIVERED, create a courier entity, or widen RLS grants. M5-005 will own
receipt confirmation, not Production.

## Database guarantees

- `SECURITY DEFINER`, owner `postgres`, empty `search_path` and qualified SQL.
- `EXECUTE` only for `authenticated`; no direct UPDATE or audit INSERT grant.
- Locks active KITCHEN Profile (`FOR SHARE`) followed by Order (`FOR UPDATE`).
  Consistent with M4 lock order; an Order cannot be dispatched twice under
  concurrent requests. A second call returns SQLSTATE `22023`.
- Only `READY` is accepted. Unknown Order IDs and unauthorized roles fail with
  SQLSTATE `42501`. Invalid `NULL` input fails with `22023`.
- Uses one `clock_timestamp()` for `orders.dispatched_at`, `orders.updated_at`,
  and `order_events.occurred_at`. Actor is `auth.uid()` in both rows.
- Order audit is `ORDER_DISPATCHED`, item ID NULL, previous/new status JSONB,
  empty metadata; prior READY attribution and all quantities are unchanged.

## Browser guarantees

- Reuse the M4 Production gateway and freshness guard, with a new READY-only
  status filter. Existing ALL_ACTIVE remains RECEIVED/IN_PROGRESS.
- A READY card offers a confirmation step. No RPC occurs when opening it or
  cancelling. Confirm invokes one trusted command, then refetches the queue.
- Failed or uncertain RPC responses are sanitized and **never automatically
  retried**. The operator must inspect the persisted state before resubmission.
- Existing Orders/OrderItems publication invalidates Production and CUSTOMER
  Tracking automatically; no new Realtime grants or SQL publication changes.

## Evidence

- `041_dispatch_order.test.sql`: COMPLETE/PARTIAL, actor and server timestamp,
  immutable line quantities, audit content, duplicate rejection, grants.
- `042_dispatch_order_security.test.sql`: roles, inactive/no Profile, anonymous,
  unknown Order, NULL UUID and all forbidden lifecycle states.
- `createSupabaseKitchenProductionCommandGateway.dispatch.test.ts`: narrow RPC,
  local validation, safe errors and zero automatic retries.
- `KitchenProductionBoard.dispatch.test.tsx`: READY filter, confirmation,
  cancellation, stale snapshot guard and safe uncertain-command handling.
- `e2e/kitchen-dispatch.spec.ts`: real JWT SQL transitions, forbidden roles,
  COMPLETE/PARTIAL and simultaneous dispatch RPCs with one audit event.
- `e2e/kitchen-dispatch-ui.spec.ts`: real KITCHEN browser confirms a READY Order
  and CUSTOMER reads DISPATCHED after the persisted change.

## Scope boundary

M5-005: CUSTOMER accepts a dispatched Order as DELIVERED. M5-006 through 008:
combined lifecycle, concurrency and adversarial regression scenarios.
