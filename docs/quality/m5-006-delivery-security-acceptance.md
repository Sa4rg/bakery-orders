# M5-006 — Delivery Security & Concurrency (revised after independent testing audit)

## Decision and scope

This milestone adds **only evidence that existing M5-004/M5-005 lifecycle commands
cannot be raced or bypassed**. No new product feature, schema migration, or
permission grant is planned. Do not apply the earlier five-file M5-006 package;
it duplicated existing role/Business matrices and used probabilistic HTTP races.

The new tests deliberately complement, rather than reproduce, these existing
checks: `041`–`044` pgTAP cover dispatch/receipt roles, invalid statuses and
atomic event metadata; the original dispatch/receipt E2E cover actual JWT and
PostgREST success paths; M4-010 covers PostgreSQL row-lock contention.

## Unique new evidence

| Risk / behavior | Evidence added | Why existing tests are insufficient |
| --- | --- | --- |
| Two distinct KITCHEN actors dispatch one READY order | `delivery-security-contention.spec.ts` uses separate authenticated DB transactions with both distinct real fixture actor IDs; waits for `pg_blocking_pids()`; checks one success, one `22023`, the winner's actor and one audit; replay using the losing actor's **real JWT** is rejected | Old `Promise.all` used one actor and did not prove actual DB blocking |
| Two distinct CUSTOMER members receive the same Order | Same approach with two separate active CUSTOMER membership identities and one historical `ORDER_DELIVERED` | Old `Promise.all` was nondeterministic and only used one actor |
| Membership revoked before receipt takes lock | `delivery-security-membership-races.spec.ts`, explicit DB transactions and observed block, real JWT rejection after revocation; zero delivery events | pgTAP 044 only revoked *before* calling |
| Receipt takes lock before membership revoked | Same spec, reversed observed block, committed receipt, single audit and actor/timestamp matched | A sequential test cannot prove lock ordering |
| Old commands cannot mutate delivered or dispatched orders | `045_delivery_terminal_guards.test.sql`, explicit pgTAP `plan(16)`, both terminal statuses for `start_order`, prepared, unavailable and customer cancellation; amounts/metadata/audit invariants | Existing tests cover old lifecycle states but not both terminal states |
| Direct table mutation through actual JWT | One representative HTTP test tries `orders` update and event forgery, then reads persisted state and audit | Prior pgTAP verifies SQL privileges; an HTTP bridge test adds evidence without reproducing role matrices |

Existing role-isolation and cross-Business coverage is intentionally **not**
duplicated in M5-006: see 042, 044, `rls-isolation.spec.ts`,
`kitchen-dispatch.spec.ts` and `customer-receipt.spec.ts`.

## Local security boundaries and limitations

- KITCHEN is a global production role; no arbitrary Business membership check
  is added to dispatch. CUSTOMER receipt requires a matching active membership.
- Local-only `pg` connections are restricted to loopback by
  `e2e/support/pgContention.ts`. The local PostgreSQL test harness temporarily
  executes trusted RPCs with `SET LOCAL ROLE authenticated` and the **distinct
  Auth user IDs**; this proves SQL locking but is not itself an HTTP JWT test.
  Separate real JWT/PostgREST requests verify post-race replay/revocation.
- The revoker transaction is run with the local DB owner to model the
  authoritative membership mutation and permit inspection of its locks.
- Separate live-JWT requests are not guaranteed to overlap precisely; the
  intentional concurrency guarantee is proven in the local PostgreSQL harness.
- Temporary Auth identities and Orders used for membership races are created
  only in the disposable local stack; teardown uses unique IDs. Never point
  these tests at a remote database.
- If RED exposes a product defect, create a **new** minimal SQL migration;
  never silently edit previously applied migrations. A test-only milestone
  may go GREEN immediately when existing guards already work.

## Acceptance

- `pnpm db:test` passes including 045's 16 assertions.
- Focused Playwright (5 tests) passes with `--workers=1 --retries=0`, then
  repeat 3× for stability. M4-010's original seven contention tests remain GREEN.
- No duplicate state transition, audit event, or altered item quantity under
  the observed races and terminal-state attacks.
- Full `pnpm typecheck`, `pnpm test:run`, `pnpm lint`, `pnpm build`,
  `pnpm db:test`, `pnpm db:lint`, `pnpm e2e`, and `git diff --check` pass.
- The final patch must be generated from the operator's actual Git tree and
  independently reviewed before staging/hash-verifying and committing.

## Follow-on boundaries

M5-007 is one whole-system complete fulfillment browser journey. M5-008 is
one partial fulfillment journey that proves preservation of quantities and
historical shortage reasons. Do not grow these into repeated permission or
concurrency matrices. A larger suite refactor is deferred until after M5-008.
