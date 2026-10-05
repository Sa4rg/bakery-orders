# Testing Strategy — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Quality Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document defines the testing strategy for Bakery Orders.

Testing is a mandatory part of implementation and architecture.

Tests exist to:

- Protect business behavior.
- Protect authorization boundaries.
- Prevent regressions.
- Verify database invariants.
- Support safe refactoring.
- Document expected behavior.
- Increase confidence before deployment.

The project follows Test-Driven Development for new business behavior whenever practical.

---

# 2. Testing Principles

The project follows these principles:

1. Test behavior, not implementation details.
2. Prefer the lowest testing level capable of proving a behavior.
3. Critical business rules require automated tests.
4. Security boundaries require positive and negative tests.
5. Database behavior must be tested independently from React.
6. E2E tests protect critical user journeys, not every UI combination.
7. Tests must remain deterministic.
8. Tests must be isolated from production data.
9. Existing tests must not be weakened merely to make new code pass.
10. A regression should receive a reproducing test before or together with its fix.

---

# 3. TDD Workflow

Preferred implementation cycle:

```text
RED
 ↓
Write a failing test describing the expected behavior.

GREEN
 ↓
Implement the minimum correct solution.

REFACTOR
 ↓
Improve structure while preserving behavior.

VERIFY
 ↓
Run affected tests and required quality checks.
```

TDD applies particularly to:

- Domain rules.
- Validation.
- Lifecycle transitions.
- Authorization logic.
- Quantity calculations.
- RPC behavior.
- Regression fixes.

Purely visual changes may not require strict test-first implementation when no behavior changes, but existing behavior must remain protected.

---

# 4. Test Levels

The project uses complementary testing layers.

```text
                    ┌──────────────┐
                    │     E2E      │
                    │  Playwright  │
                    └──────┬───────┘
                           │
                  ┌────────▼────────┐
                  │   Integration   │
                  │ React/Supabase  │
                  └────────┬────────┘
                           │
          ┌────────────────▼────────────────┐
          │        Database Tests           │
          │ pgTAP / RLS / RPC / Constraints│
          └────────────────┬────────────────┘
                           │
             ┌─────────────▼─────────────┐
             │ Unit & Component Tests    │
             │ Vitest + RTL              │
             └───────────────────────────┘
```

Each level has a different responsibility.

---

# 5. Unit Tests

**Primary tool:** Vitest

Unit tests cover isolated business behavior.

Examples:

- Quantity calculations.
- Fulfillment classification.
- Zod schemas.
- Domain predicates.
- Date/time helpers.
- Transformation functions.
- State-independent business rules.

Example conceptual test:

```text
requested = 30
prepared = 20
unavailable = 10

remaining = 0
fulfillment = PARTIAL
```

Unit tests should be:

- Fast.
- Deterministic.
- Independent from Supabase.
- Focused on observable behavior.

Do not mock everything merely to call a function.

Prefer pure functions where they naturally fit the domain.

---

# 6. Component Tests

**Primary tools:**

- Vitest.
- React Testing Library.
- `@testing-library/user-event`.

Component tests verify UI behavior from the user's perspective.

Examples:

- Cart quantity modification.
- Validation messages.
- Order confirmation forms.
- Disabled actions.
- Loading state.
- Error state.
- Empty state.
- Fulfillment progress.
- Role-dependent controls.

Prefer queries representing how users interact with the interface:

```text
role
label
text
accessible name
```

Avoid depending unnecessarily on:

```text
CSS classes
internal React state
component implementation details
```

---

# 7. Database Tests

**Primary tool:** pgTAP

Database tests are mandatory because PostgreSQL contains critical application behavior.

Tests live under:

```text
supabase/tests/database/
```

Database tests cover:

- Table structure.
- Constraints.
- Foreign keys.
- Unique constraints.
- RLS.
- Grants.
- RPC functions.
- Lifecycle enforcement.
- Quantity invariants.
- Audit generation.
- Idempotency.
- Permission boundaries.

Expected command:

```text
supabase test db
```

Database tests execute against local Supabase.

---

# 8. RLS Testing

Every security-sensitive policy requires both allowed and rejected scenarios.

Example:

```text
CUSTOMER A
    → Own Order              ALLOWED

CUSTOMER A
    → CUSTOMER B Order       DENIED

KITCHEN
    → Production Orders      ALLOWED

KITCHEN
    → Business Administration
                               DENIED
```

A policy is not sufficiently tested merely because an authorized request succeeds.

Negative authorization tests are mandatory.

---

# 9. RPC Testing

Critical RPC functions require database-level tests.

Expected commands include:

```text
create_order
start_order
record_prepared_quantity
record_unavailable_quantity
mark_order_ready
dispatch_order
confirm_order_delivery
cancel_order
```

Tests must cover:

- Correct role.
- Incorrect role.
- Invalid state.
- Valid state.
- Invalid quantity.
- Boundary quantity.
- Unauthorized establishment.
- Audit event generation.
- Transaction rollback on failure.
- Relevant concurrency conditions.

---

# 10. Integration Tests

Integration tests verify collaboration between application layers.

Examples:

```text
React Application
       ↓
Supabase Client
       ↓
Local Supabase
       ↓
PostgreSQL
```

Integration tests may verify:

- Authentication session integration.
- Catalog data retrieval.
- Order queries under real RLS.
- Application hooks consuming Supabase.
- Data mapping between PostgreSQL-generated types and domain code.

Integration tests must not connect to production.

Local Supabase is the default test backend.

---

# 11. End-to-End Tests

**Primary tool:** Playwright

E2E tests protect critical business workflows.

They should represent realistic user behavior through the browser.

The initial critical flow is:

```text
CUSTOMER login
     ↓
Browse catalog
     ↓
Create cart
     ↓
Confirm order
     ↓
KITCHEN receives order
     ↓
Start preparation
     ↓
Prepare quantities
     ↓
Mark READY
     ↓
Dispatch
     ↓
CUSTOMER confirms receipt
```

---

# 12. Required E2E Scenarios

At minimum, MVP release coverage must include:

### E2E-001 — Complete Order

```text
CUSTOMER creates order
→ KITCHEN fulfills everything
→ Order READY
→ DISPATCHED
→ CUSTOMER confirms DELIVERED
```

### E2E-002 — Partial Fulfillment

```text
CUSTOMER creates order
→ KITCHEN prepares part
→ KITCHEN marks shortage
→ CUSTOMER sees change
→ Order continues without approval
→ DISPATCHED
→ DELIVERED
```

### E2E-003 — Customer Cancellation

```text
CUSTOMER creates order
→ Status RECEIVED
→ CUSTOMER cancels
→ Order becomes CANCELLED
```

### E2E-004 — Manager Cancellation

```text
Order IN_PROGRESS
→ CUSTOMER cannot cancel
→ MANAGER cancels
→ History remains available
```

### E2E-005 — Cross-Business Isolation

```text
CUSTOMER A
→ attempts access to CUSTOMER B order
→ access denied
```

### E2E-006 — Total Unavailability

```text
KITCHEN resolves all quantities as unavailable
→ READY rejected
→ MANAGER intervention required
```

---

# 13. Test Data

Automated tests use fictional deterministic data.

Never use real customer or employee information merely for testing.

Fixtures should describe intent.

Example:

```text
customerA
customerB
kitchenUser
managerUser
businessA
businessB
availableProduct
unavailableProduct
```

Avoid unexplained fixture values.

---

# 14. Database Reset

Local database tests should begin from a reproducible schema.

Expected workflow:

```text
supabase db reset
```

This reconstructs local state from:

- Versioned migrations.
- Seed configuration.

Tests must not depend on manually created Dashboard state.

---

# 15. Test Isolation

Tests must not depend on execution order.

A test should not assume that another test:

- Created its user.
- Created its order.
- Modified its product.
- Left database state behind.

Test setup must make dependencies explicit.

---

# 16. Mocking Policy

Mock only boundaries where isolation provides value.

Appropriate examples:

- Browser APIs.
- External services.
- Time where deterministic control is needed.

Avoid mocking Supabase in tests whose purpose is to verify actual RLS or database behavior.

A mocked security policy proves nothing about the real policy.

---

# 17. External Services

Future external integrations must be isolated behind explicit boundaries.

Tests must not depend on sending real:

- WhatsApp messages.
- Emails.
- Paid API requests.

Unit and integration tests use controlled substitutes.

Dedicated integration environments may test providers separately when required.

---

# 18. Coverage Strategy

Code coverage is a quality indicator, not proof of correctness.

Initial target:

```text
Overall application code:
≥ 80% meaningful coverage
```

Critical domain and security-sensitive behavior should aim for complete relevant branch coverage.

Examples:

- Lifecycle transitions.
- Quantity invariants.
- Authorization decisions.
- Order creation rules.
- Partial fulfillment.
- Cancellation rules.

Coverage must never be increased through meaningless tests that assert implementation details.

Coverage thresholds may be adjusted through a documented quality decision as the project evolves.

---

# 19. Regression Testing

Every confirmed defect affecting behavior should receive an automated regression test when practical.

Workflow:

```text
Bug discovered
      ↓
Reproduce with failing test
      ↓
Fix
      ↓
Test becomes green
      ↓
Regression protected
```

---

# 20. Test Naming

Tests should communicate behavior.

Preferred structure:

```text
describe("createOrder", () => {
  it("rejects an order with no items", ...)
})
```

Avoid vague names:

```text
works correctly
test case 1
should work
```

Database test filenames should describe their responsibility.

Example:

```text
orders_rls.test.sql
order_quantities.test.sql
create_order_rpc.test.sql
order_lifecycle.test.sql
```

---

# 21. File Placement

Suggested conventions:

```text
src/features/orders/
├── domain/
│   ├── order.rules.ts
│   └── order.rules.test.ts
│
├── components/
│   ├── OrderCard.tsx
│   └── OrderCard.test.tsx
```

Database:

```text
supabase/tests/database/
```

E2E:

```text
e2e/
├── order-complete.spec.ts
├── order-partial.spec.ts
└── authorization.spec.ts
```

Tests should normally remain near the behavior they protect unless the test type requires a separate directory.

---

# 22. CI Quality Gates

Pull requests should eventually execute:

```text
Install dependencies
      ↓
Lint
      ↓
TypeScript typecheck
      ↓
Unit tests
      ↓
Component tests
      ↓
Start local Supabase
      ↓
Apply migrations
      ↓
Database tests
      ↓
Integration tests
      ↓
Build
```

Critical E2E tests may run in the same pipeline or an appropriate dedicated job.

A failing mandatory quality gate blocks release readiness.

---

# 23. Required Developer Verification

Before declaring an implementation complete, the agent/developer must report:

- Tests added or changed.
- Tests executed.
- Typecheck result.
- Lint result where applicable.
- Database tests where applicable.
- Known test gaps.

"Tests should pass" is not equivalent to running them.

---

# 24. Prohibited Testing Practices

Do not:

- Delete tests simply because they fail after a change.
- Weaken assertions to accommodate incorrect behavior.
- Skip security tests for convenience.
- Mock the exact behavior being tested.
- Depend on production data.
- Introduce arbitrary sleeps to hide race conditions.
- Test private implementation details unnecessarily.
- use snapshot tests as a replacement for meaningful behavior tests.

If a requirement legitimately changes, update the corresponding documentation and then update its tests.

---

# 25. Definition of Done — Testing

A behavior-changing task is not complete until:

1. Expected behavior is understood.
2. Relevant tests exist.
3. Tests pass.
4. Type checking passes.
5. Applicable database tests pass.
6. No unrelated tests were disabled.
7. Known gaps are explicitly reported.

Security-sensitive work additionally requires negative authorization tests.

---

# 26. Release Testing Gate

Before a public release:

- All mandatory automated tests pass.
- Critical E2E flows pass.
- RLS tests pass.
- RPC tests pass.
- Migration-from-clean-state succeeds.
- Production build succeeds.
- No ignored critical regression remains.
- Security release checklist is completed.

Testing provides evidence for release readiness.

It does not replace the dedicated security review.