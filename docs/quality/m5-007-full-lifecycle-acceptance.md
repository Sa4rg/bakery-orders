# M5-007 — Full Order Lifecycle E2E

## Purpose and scope

One high-value, complete-fulfillment browser journey demonstrates that the
previously tested commands, UI wiring and authorized Realtime tracking work
**together** on the same Order. No migrations, RPC changes, extra role/status
matrix or duplicate concurrency scenarios are part of M5-007.

## Unique acceptance evidence

| Step | Evidence | Boundary |
| --- | --- | --- |
| CUSTOMER creates | Catalog → cart → review → one Place order click; persisted UUID | Browser with CUSTOMER session |
| KITCHEN receives | Listener connected **before** creation; new Order appears in RECEIVED queue without reload/Refresh | Authenticated WAL invalidation + authorized read |
| KITCHEN prepares | Start, +3 prepared via UI; CUSTOMER selected detail changes to IN_PROGRESS and shows exact persisted amount without refresh | Trusted commands + CUSTOMER Realtime |
| KITCHEN completes | READY enabled only after full resolution; CUSTOMER sees READY automatically | Quantity invariant + Realtime |
| KITCHEN dispatches | READY queue; first confirmation click read-only, second performs RPC; CUSTOMER observes DISPATCHED automatically | Trusted dispatch + Realtime |
| CUSTOMER receives | First click read-only, second performs RPC; Tracking displays DELIVERED | Trusted receipt + authoritative refetch |
| Persistence | One OrderItem: requested=3, prepared=3, unavailable=0; six ordered audit events; actor/timestamp consistency; reload retains DELIVERED and removes receipt command | Read-only local privileged assertions + CUSTOMER browser |

The test is `e2e/customer-full-lifecycle.spec.ts`. Shared UI helpers are limited to
customer order placement, keyset page traversal and a displayed quantity locator
(`e2e/support/lifecycleUi.ts`); M5-008 may reuse them for the partial journey.

## Non-duplication decision

This test does **not** repeat RLS/role denial, invalid status matrices, dispatch
and receipt race tests, or the SQL structure of each event payload. M5-004,
M5-005 and M5-006 already cover those guarantees. The new guarantee is the
unbroken full **browser-to-browser lifecycle** with Realtime propagation.

## Safety and stability

- Global Playwright setup provisions fictional users on loopback Supabase only.
- Production writes occur once via real browser UI with authenticated sessions.
- Admin client performs read-only verification, never setup/mutation of Orders.
- Unique notes distinguish this Order from other parallel tests.
- Requested delivery date is future-relative, not hardcoded to a past year.
- Keyset pagination navigates without manual refresh or browser reload.
- Read-only checks use bounded polling; no sleeps or mutation retries.
- Reload occurs **only after** all Realtime assertions, to verify persistence.
- Cleanup closes the separate browser context. Fixture teardown remains owned
  by the existing global fixture harness.

## Acceptance protocol

1. `pnpm exec tsc -p tsconfig.e2e.json --noEmit`
2. `pnpm exec playwright test e2e/customer-full-lifecycle.spec.ts --project=chromium --workers=1 --retries=0` (expect **1 passed**)
3. The same test with `--repeat-each=3 --retries=0` (expect **3 passed**)
4. Full regression: `pnpm typecheck`, `pnpm test:run`, `pnpm lint`, `pnpm build`, `pnpm db:test`, `pnpm db:lint`, `pnpm e2e`.
5. Review the patch from the operator's real HEAD and compare SHA-256/Git tree
   before committing. Never claim GREEN from static inspection alone.

No new SQL/production changes are expected. If the integrated E2E exposes a
real defect, reproduce and implement the smallest correct GREEN change without
weakening its acceptance guarantees.
