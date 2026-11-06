# M5-008 — Partial Fulfillment Full Lifecycle E2E

## Scope

One browser-to-browser lifecycle on **one Order** with **one OrderItem**:
CUSTOMER requests 3 units; KITCHEN prepares 1 and records 2 unavailable with
one mandatory historical reason; KITCHEN marks the Order `READY` with
`PARTIAL` fulfillment, dispatches it, and CUSTOMER confirms receipt. The Order
finishes `DELIVERED` with the original quantities and reason intact.

This is the partial complement of M5-007, not a new role/RLS/concurrency matrix.
The test is `e2e/customer-partial-lifecycle.spec.ts` and reuses the already
reviewed `e2e/support/lifecycleUi.ts` **without modifying the helper**.

## Acceptance evidence

| Boundary | Observable guarantee |
| --- | --- |
| CUSTOMER creates | One actual browser click; unique Order with requested=3 |
| Realtime KITCHEN | Subscriber ready before creation; Order appears in RECEIVED without reload/manual Refresh |
| KITCHEN starts | Trusted command moves Order to IN_PROGRESS; CUSTOMER sees it without reload |
| Prepared quantity | Record exactly +1 through KITCHEN UI; CUSTOMER reads prepared=1, unavailable=0, remaining=2 |
| Shortage | Record +2 and one reason via KITCHEN UI; CUSTOMER sees unavailable=2, remaining=0 and historical reason without reload |
| READY | Kitchen reports PARTIAL; Customer sees READY with unchanged quantities and reason |
| Dispatch | Explicit two-step confirmation; first click read-only; Customer sees DISPATCHED without reload |
| Receipt | Explicit two-step confirmation; first click read-only; Customer sees DELIVERED without reload |
| Persisted state | One OrderItem with requested=3, prepared=1, unavailable=2, exactly seven ordered events; QUANTITY_UNAVAILABLE reason and ORDER_READY PARTIAL metadata, actor and timestamp consistency |
| Historic read | After terminal-state reload, CUSTOMER opens Order by UUID and sees DELIVERED, 3/1/2/0 and original reason; no further receipt action |

## Explicit non-duplication

- M5-007 already covers COMPLETE. M5-008 covers PARTIAL and historical shortage
  projection surviving dispatch, receipt and reload.
- M5-004/005/006 own invalid-state matrices, role/RLS adversarial tests and
  concurrency; they are not copied here.
- Admin Supabase is **read-only verification**. Mutations occur only via real
  authenticated CUSTOMER and KITCHEN browser interactions.
- There is no forced Refresh, browser reload, `sleep`, automatic mutation retry
  or mock used to satisfy the Realtime steps. Reload is reserved for the final
  historical-persistence assertion.
- Local E2E fixtures and cleanup are unchanged. No schema, production code,
  permissions or Realtime subscriptions are added by this milestone.

## Validation and commit gate

1. Confirm HEAD tree equals reviewed M5-007 tree and the worktree is clean.
2. `pnpm exec tsc -p tsconfig.e2e.json --noEmit`.
3. `pnpm exec playwright test e2e/customer-partial-lifecycle.spec.ts --project=chromium --workers=1 --retries=0` (1 passed).
4. Run the same spec with `--repeat-each=3 --retries=0` (3 passed).
5. Full regression: `pnpm typecheck`, `pnpm test:run`, `pnpm lint`, `pnpm build`, `pnpm db:test`, `pnpm db:lint`, `pnpm e2e` and `git diff --check`.
6. Generate final patch from the **operator's real Git tree**, review its
   SHA-256 and Git tree, then and only then authorize commit.

A red test is evidence to investigate. Diagnose persisted data and application
code before changing a test; never weaken a UI/Realtime requirement just to
get green. No test execution against the operator's Supabase is claimed here.
