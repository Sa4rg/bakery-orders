# FILE: .github/instructions/testing.instructions.md

---
applyTo: "**/*.{test,spec}.{ts,tsx,js,jsx},supabase/tests/**/*.sql,e2e/**/*"
---

# Testing Instructions — Bakery Orders

## 1. Principle

Tests protect accepted behavior.

Do not write tests merely to increase coverage numbers.

Do not change correct production behavior solely to satisfy a poorly designed test.

At the same time, never weaken a valid test merely to make new code pass.

---

## 2. TDD

For new business behavior, prefer:

```text
RED
→ GREEN
→ REFACTOR
```

The failing test should describe the behavior being introduced or corrected.

---

## 3. Test the Correct Layer

Prefer the lowest layer that proves the behavior.

| Concern | Preferred Layer |
|---|---|
| Pure calculation | Vitest unit |
| Zod schema | Vitest unit |
| React interaction | RTL |
| DB constraint | pgTAP |
| RLS | pgTAP |
| RPC | Database/integration |
| Full business flow | Playwright |

Avoid proving a database invariant exclusively through a browser test.

---

## 4. Behavior Over Implementation

Tests should assert externally visible behavior.

Avoid coupling unnecessarily to:

- Private state.
- Internal helper calls.
- CSS classes.
- Exact component tree.
- Implementation-specific mocks.

Refactoring should not break tests when behavior remains unchanged.

---

## 5. Unit Tests

Unit tests should be:

- Fast.
- Deterministic.
- Focused.
- Independent from external infrastructure unless infrastructure behavior is the subject.

Use descriptive names.

Prefer:

```text
rejects quantities greater than requested
```

over:

```text
works correctly
```

---

## 6. React Testing Library

Test from the user's perspective.

Prefer queries by:

```text
role
label
accessible name
text
```

Use `user-event` for user interaction.

Do not test accessibility-hostile implementation patterns by relying on selectors unavailable to real users.

---

## 7. Database Tests

Use pgTAP for PostgreSQL behavior.

Security-sensitive database tests must simulate relevant authenticated roles/context rather than assuming policy behavior.

Test both successful and rejected scenarios.

---

## 8. RLS Tests

Every important RLS policy requires at least:

```text
Authorized access succeeds.
Unauthorized access fails.
```

Examples:

```text
CUSTOMER A can read Order A.
CUSTOMER A cannot read Order B.

KITCHEN can read production queue.
KITCHEN cannot perform manager administration.
```

Do not omit negative tests.

---

## 9. RPC Tests

For critical RPC functions test:

- Valid role.
- Invalid role.
- Valid state.
- Invalid state.
- Valid boundary value.
- Invalid value.
- Unauthorized resource.
- Audit creation.
- Rollback on failure.

Where relevant:

- Idempotency.
- Concurrency.

---

## 10. Order Quantity Tests

Protect:

```text
requested > 0
prepared >= 0
unavailable >= 0
prepared + unavailable <= requested
```

Test exact boundaries.

Examples:

```text
prepared + unavailable = requested   ALLOWED
prepared + unavailable > requested   DENIED
```

---

## 11. Lifecycle Tests

Cover approved transitions:

```text
RECEIVED → IN_PROGRESS
IN_PROGRESS → READY
READY → DISPATCHED
DISPATCHED → DELIVERED
```

and invalid transitions.

Example:

```text
RECEIVED → DELIVERED
```

must fail.

---

## 12. Partial Fulfillment Tests

Verify:

- Requested quantity remains unchanged.
- Unavailable quantity requires a reason.
- Partial fulfillment does not require CUSTOMER approval.
- PARTIAL order may become READY after all quantities are resolved.
- Fully unavailable order cannot become READY.

---

## 13. Idempotency Tests

Verify that:

```text
same actor + same idempotency key
```

does not create another order.

Verify a different valid key can create another intentional order.

---

## 14. Audit Tests

Verify critical successful operations generate appropriate audit data.

Verify client cannot forge:

- Actor.
- Trusted timestamp.

Verify normal operational users cannot arbitrarily edit/delete historical audit records.

---

## 15. Regression Tests

When fixing a confirmed defect:

1. Reproduce with a failing test where practical.
2. Implement the fix.
3. Confirm the test passes.
4. Keep the test to prevent recurrence.

---

## 16. E2E

Playwright protects critical workflows, including:

- Complete order.
- Partial fulfillment.
- Customer cancellation.
- Manager cancellation.
- Total unavailability.
- Receipt confirmation.
- Repeat order.
- Cross-business isolation.

Do not use E2E to test every cosmetic combination.

---

## 17. Determinism

Tests must not depend on:

- Production data.
- Real customer accounts.
- Uncontrolled time.
- Random order.
- Prior test execution.
- Arbitrary sleeps.

Control time or generated data when determinism matters.

---

## 18. Test Data

Use fictional and intentional test fixtures.

Prefer meaningful fixture names:

```text
customerA
customerB
businessA
businessB
kitchenUser
managerUser
```

Avoid unexplained UUIDs scattered through tests when reusable builders/fixtures improve readability.

Do not over-engineer fixture frameworks prematurely.

---

## 19. Mocks

Mock only when it isolates a boundary meaningfully.

Do not mock:

- RLS when testing RLS.
- PostgreSQL constraint when testing constraint behavior.
- RPC behavior when the test claims to prove the RPC.

A mocked security control is not evidence that the actual control works.

---

## 20. Coverage

Coverage is a diagnostic metric.

Aim for meaningful coverage, with particular attention to critical branch behavior.

Do not create meaningless assertions only to raise percentages.

Critical business/security behavior takes precedence over global numeric coverage.

---

## 21. Skipped Tests

Do not introduce:

```text
.skip
todo
disabled tests
```

without an explicit documented reason.

Existing failing tests must not simply be skipped.

---

## 22. Test Failures

When a test fails:

1. Determine whether behavior or test expectation is wrong.
2. Check canonical documentation.
3. Fix the incorrect side.
4. Do not weaken assertions reflexively.

If documentation is ambiguous, report the ambiguity.

---

## 23. Test Completion Report

At the end of a task report:

- Tests added.
- Tests modified.
- Test commands executed.
- Results.
- Any tests intentionally not executed and why.
- Known coverage gaps.

Never state that tests passed when they were not actually run.