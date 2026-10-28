# M4 — Production acceptance matrix (M4-011)

## Release boundary

M4 ends at **READY**. `DISPATCHED`, `DELIVERED`, customer tracking, and explicit managerial cancellation are not implemented by this acceptance milestone; those responsibilities belong to subsequent milestones. No browser controls may invent those transitions.

All fixture mutations in E2E tests must use real CUSTOMER/KITCHEN browser sessions or the existing JWT-backed trusted command gateways. Privileged Supabase credentials are permitted **only for read-side assertions and local fixture setup**.

## End-to-end acceptance coverage

| Requirement | Primary executable evidence | Expected durable state |
| --- | --- | --- |
| CUSTOMER browser creates Order; KITCHEN receives it without reload | `e2e/kitchen-production-acceptance.spec.ts` (both tests), `e2e/kitchen-production-ui.spec.ts` | `ORDER_CREATED`; RECEIVED queue invalidated via Realtime |
| COMPLETE fulfillment via browser, then READY | `e2e/kitchen-production-acceptance.spec.ts` (`COMPLETE`) | Prepared equals requested, unavailable zero; `READY`, one `ORDER_READY` event |
| PARTIAL fulfillment via browser, then READY | `e2e/kitchen-production-ui.spec.ts` | Prepared positive, unavailable positive, remaining zero; `READY`, one `ORDER_READY` event |
| UNRESOLVED cannot reach READY | `e2e/kitchen-ready.spec.ts` (`UNRESOLVED`), pgTAP 037 | Remains `IN_PROGRESS`, no READY event |
| UNAVAILABLE requires managerial intervention | `e2e/kitchen-production-acceptance.spec.ts` (`UNAVAILABLE`), `e2e/kitchen-total-unavailability.spec.ts` | Remains `IN_PROGRESS`; MANAGER inbox; no READY, cancellation or dispatch event |
| CUSTOMER/MANAGER cannot run trusted production mutations | `e2e/kitchen-ready.spec.ts`, `e2e/kitchen-production-ui.spec.ts`, pgTAP 037/038 | SQLSTATE `42501` or role-gated UI, no direct writes |
| Exact quantity steps, deltas, remaining and reason | `e2e/kitchen-production-ui.spec.ts`, `e2e/kitchen-fulfillment.spec.ts`, pgTAP 032–035 | Authoritative thousandths and exact quantity audit |
| Concurrent quantities, start/cancel, READY and double start | `e2e/kitchen-concurrency.spec.ts`, `e2e/kitchen-lock-contention.spec.ts` | Correct transaction serialization; no duplicate audit |
| SQL ownership and direct-write denial | `supabase/tests/database/038_production_security_audit.test.sql` | No browser INSERT/UPDATE privileges on operational rows |

## Execution gate

From `feature/kitchen-production`, with the **local** Supabase stack running:

```powershell
pnpm typecheck
pnpm test:run
pnpm lint
pnpm build
pnpm db:test
pnpm db:lint
pnpm exec playwright test e2e/kitchen-production-acceptance.spec.ts --project=chromium --workers=2 --retries=0
pnpm exec playwright test e2e/kitchen-production-acceptance.spec.ts --project=chromium --workers=2 --repeat-each=3 --retries=0
pnpm e2e
git diff --check
```

The new focused test file must report **2 passed**, then **6 passed** when repeated three times. The full suite must be green; never raise retries, extend waits blindly or retry incremental trusted writes to conceal failures. The `expect.poll` calls in the new acceptance scenarios are read-only verification, not mutation retries.

## Non-goals / conditions for sign-off

- No database migration, extra roles, new order status, speculative cancellation, or status update from React is introduced by M4-011.
- `READY` authorization still belongs exclusively to PostgreSQL (`mark_order_ready`).
- Manager intervention is read-only; the fully unavailable Order remains `IN_PROGRESS` pending a separately defined authorized resolution.
- The existing partial, concurrency, and security tests are **required** parts of acceptance. M4-011 adds complete-browser COMPLETE and three-role intervention coverage rather than duplicating every prior scenario.
- Sign-off requires a clean test report **and** review of the exact staged patch before the milestone commit.
