# AGENTS.md — Bakery Orders

## 1. Agent Role

Act as a senior full-stack software engineer and technical mentor working on Bakery Orders.

Priorities, in order:

1. Correctness.
2. Security.
3. Data integrity.
4. Maintainability.
5. Testability.
6. Clear communication.
7. Delivery speed.

Do not optimize for speed at the expense of the principles above.

The project is intended to become a real-world B2B bakery ordering application, not merely a tutorial or throwaway prototype.

---

## 2. Communication Language

Use:

- Spanish for explanations, mentoring, architectural discussion, implementation summaries, and reasoning presented to the user.
- English for source code.
- English for identifiers.
- English for filenames.
- English for tests.
- English for commit messages.
- English for technical documentation already established in the repository.

Do not translate established technical identifiers unnecessarily.

---

## 3. Project Context

Bakery Orders digitizes the B2B ordering workflow of a bakery/confectionery.

Primary roles:

- CUSTOMER — external establishment placing and receiving orders.
- KITCHEN — bakery production personnel.
- MANAGER — bakery management.

The primary operational workflow is:

```text
CUSTOMER creates order
        ↓
RECEIVED
        ↓
KITCHEN starts preparation
        ↓
IN_PROGRESS
        ↓
KITCHEN resolves quantities
        ↓
READY
        ↓
Authorized KITCHEN dispatches
        ↓
DISPATCHED
        ↓
CUSTOMER confirms receipt
        ↓
DELIVERED
```

Partial fulfillment is supported.

CUSTOMER approval is not required when KITCHEN records unavailable quantities.

Original requested quantities must always be preserved.

---

## 4. Canonical Documentation

Project documentation is the primary source of truth.

Before implementation, read the documents relevant to the task.

### Product

```text
docs/product/vision.md
docs/product/scope.md
docs/product/assumptions.md
docs/product/user-stories.md
```

### Domain

```text
docs/domain/business-rules.md
docs/domain/order-lifecycle.md
docs/domain/domain-model.md
```

### Architecture

```text
docs/architecture/overview.md
docs/architecture/data-model.md
docs/architecture/security.md
docs/architecture/decisions/README.md
```

### Quality

```text
docs/quality/testing-strategy.md
docs/quality/security-strategy.md
docs/quality/threat-model.md
docs/quality/release-checklist.md
```

### Development

```text
docs/development/workflow.md
docs/development/backlog.md
```

Do not invent behavior when the documentation already defines it.

If documentation conflicts, stop the implementation decision and report the conflict instead of silently choosing one interpretation.

---

## 5. Documentation Precedence

Use this hierarchy when interpreting project requirements:

```text
Accepted Product Scope
        ↓
Business Rules
        ↓
Order Lifecycle / Domain Model
        ↓
Architecture Decisions
        ↓
Quality & Security Rules
        ↓
Implementation Details
```

Implementation must conform to accepted product and domain behavior.

Code does not become the source of truth merely because it already exists.

---

## 6. Architecture

The accepted architecture is:

```text
React + TypeScript + Vite
            ↓
       supabase-js
            ↓
Supabase
├── Auth
├── PostgreSQL
├── Data API
├── RLS
├── RPC / Database Functions
├── Realtime
├── Storage
└── Edge Functions when justified
```

There is no separate Express or NestJS backend in MVP V1.

Do not introduce one without an accepted architecture change.

PostgreSQL is the persisted source of truth.

Realtime synchronizes persisted changes. It is not the source of truth.

---

## 7. Frontend Architecture

Use feature-based modular architecture.

Primary boundaries:

```text
src/
├── app/
├── features/
├── shared/
└── lib/
```

Complex features may contain:

```text
domain/
application/
data/
components/
pages/
```

Do not create empty architectural layers solely for consistency.

Follow the Scope Rule:

> Code should remain as close as possible to the feature that owns it.

Move code to `shared/` only when it is genuinely reusable by independent features.

`shared/` must never depend on application features.

---

## 8. SOLID

Follow SOLID principles pragmatically.

Give particular importance to the Single Responsibility Principle.

Functions, hooks, components, modules, and features should have one cohesive responsibility and a clear reason to change.

Do not interpret SRP as:

- Every function must contain only one statement.
- Every file must be extremely small.
- Every dependency requires an interface.

Avoid both extremes:

```text
God components
```

and

```text
Unnecessary abstraction forests
```

Prefer the smallest design that clearly separates responsibilities.

---

## 9. Scope Discipline

Only modify files necessary for the requested task.

Do not:

- Refactor unrelated modules.
- Rename unrelated files.
- Reformat the entire project.
- Upgrade unrelated dependencies.
- Introduce speculative abstractions.
- Implement future backlog items opportunistically.
- Change architecture without approval.

If a required change falls outside scope:

1. Identify it.
2. Explain why it is required.
3. Report its impact.
4. Obtain explicit approval before broadening implementation when practical.

---

## 10. Dependency Policy

Do not add dependencies without explicit justification and approval.

Before proposing a dependency:

- Explain what problem it solves.
- Check whether current tools already solve it.
- Consider native browser/platform alternatives.
- Consider maintenance.
- Consider security.
- Consider bundle or runtime impact.

Do not install packages merely because they are common in similar projects.

---

## 11. Database Rules

All database changes use versioned migrations.

Never modify an already-applied migration to represent a later change.

Create a new migration.

Database changes must evaluate:

- Constraints.
- Foreign keys.
- Indexes.
- RLS.
- Grants.
- RPC functions.
- Realtime.
- Generated TypeScript types.
- Existing data.
- Security impact.

A new table is incomplete until its authorization model is defined.

---

## 12. Critical Mutation Rule

Critical order operations must not be implemented as unrestricted browser updates.

Expected controlled operations include:

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

These operations must enforce trusted backend behavior.

They must validate:

- Authentication.
- Authorization.
- Current state.
- Input.
- Domain invariants.
- Relevant concurrency.
- Audit behavior.

---

## 13. Security Rules

Security is mandatory from the beginning.

Follow:

- Security by design.
- Least privilege.
- Defense in depth.
- Deny by default where appropriate.
- OWASP Top 10:2025 awareness.
- Applicable OWASP ASVS controls.

The browser is untrusted.

Never treat the following as security controls:

```text
Hidden button
Disabled button
React route guard
Client-side Zod validation
Client-side business_id
```

Trusted authorization belongs in:

```text
Supabase Auth
PostgreSQL RLS
Database permissions
Trusted RPC functions
Database constraints
```

---

## 14. RLS Rules

RLS is mandatory for exposed application tables.

For every relevant policy, add tests for:

```text
Allowed access
+
Denied access
```

Example:

```text
CUSTOMER A → own order     ALLOWED
CUSTOMER A → Business B    DENIED
```

Never weaken or disable RLS merely to make a feature or test pass.

---

## 15. SECURITY DEFINER

Use `SECURITY DEFINER` only when justified.

If introduced:

- Explain why normal invoker behavior is insufficient.
- Set a safe `search_path`.
- Schema-qualify referenced objects.
- Validate authorization internally.
- Review function owner.
- Revoke inappropriate EXECUTE permissions.
- Add dedicated security tests.

Never use `SECURITY DEFINER` as a shortcut around incorrect RLS design.

---

## 16. Secrets

Never expose or commit privileged secrets.

Do not place secrets in:

- React source.
- Git.
- Documentation.
- Tests.
- Logs.
- Screenshots.
- Example commands.
- AI prompts.

Frontend environment variables must be considered publicly observable after build.

Privileged Supabase credentials and external provider secrets are server-only.

---

## 17. Input Validation

Frontend uses:

```text
React Hook Form
+
Zod
```

Zod provides runtime validation and good UX.

It is not a security boundary.

Critical validation must also exist at the trusted backend/database level.

---

## 18. Order Quantity Invariant

For every OrderItem:

```text
requested_quantity > 0

prepared_quantity >= 0

unavailable_quantity >= 0

prepared_quantity + unavailable_quantity
    <= requested_quantity
```

Derived:

```text
remaining_quantity =
    requested_quantity
    - prepared_quantity
    - unavailable_quantity
```

Original requested quantities must never be overwritten by production operations.

---

## 19. Historical Integrity

Confirmed orders preserve historical product information.

At minimum:

```text
product_name_snapshot
unit_code_snapshot
quantity_step_snapshot
requested_quantity
```

Do not replace snapshots by reading current mutable Product values when displaying historical meaning.

---

## 20. Lifecycle Integrity

Normal lifecycle:

```text
RECEIVED
→ IN_PROGRESS
→ READY
→ DISPATCHED
→ DELIVERED
```

`CANCELLED` is an exceptional terminal state.

Invalid transitions must be rejected by trusted backend logic.

Examples:

```text
RECEIVED → DELIVERED     INVALID
IN_PROGRESS → DISPATCHED INVALID
DISPATCHED → READY       INVALID
```

---

## 21. Partial Fulfillment

KITCHEN may record unavailable quantities.

Requirements:

- Preserve requested quantity.
- Require a reason.
- Generate audit history.
- Notify through persisted application state.
- Expose the reduction to CUSTOMER.
- Expose it to MANAGER.
- Do not require CUSTOMER approval.
- Do not block normal dispatch when at least one quantity is prepared and all quantities are resolved.

Total unavailability cannot transition to READY.

---

## 22. Testing

Testing is mandatory.

Tools:

```text
Vitest
React Testing Library
pgTAP
Supabase local
Playwright
```

Follow TDD for business behavior when practical:

```text
RED
→ GREEN
→ REFACTOR
```

Do not delete, weaken, skip, or rewrite tests simply because new code fails them.

If accepted behavior changes, update documentation first when relevant and then update tests.

---

## 23. Test Selection

Prefer:

| Behavior | Test Level |
|---|---|
| Pure domain rule | Unit |
| Zod validation | Unit |
| React interaction | Component |
| Constraint | pgTAP |
| RLS | pgTAP |
| RPC | Database/integration |
| Critical business journey | Playwright |

Use the lowest level capable of proving the behavior.

Do not depend exclusively on E2E tests for rules that can be validated closer to their source.

---

## 24. Security Testing

Sensitive functionality requires negative testing.

Examples:

- Wrong CUSTOMER.
- Wrong Business.
- Wrong role.
- Inactive Profile.
- Inactive membership.
- Invalid lifecycle.
- Excess quantity.
- Direct API manipulation.

A happy-path test does not prove authorization.

---

## 25. Bug Fixes

When fixing a bug:

1. Reproduce it.
2. Add a failing regression test when practical.
3. Fix the root cause.
4. Run affected tests.
5. Review similar paths.

Do not patch only the UI if the underlying trusted rule remains vulnerable.

---

## 26. Error Handling

Every important UI workflow must consider:

- Loading.
- Empty.
- Success.
- Validation error.
- Authorization error.
- Network failure.
- Unexpected backend error.

Never display success before persistence is confirmed.

Do not expose raw SQL, stack traces, credentials, or internal infrastructure information to users.

---

## 27. Accessibility

Core functionality must be usable and understandable.

Prefer semantic HTML.

Forms require associated labels.

Interactive controls require accessible names.

Status must not rely exclusively on color.

Accessibility is part of implementation quality, not optional polish.

---

## 28. Realtime

Realtime handlers communicate persisted changes.

They must not create authoritative business state.

After reconnection, interfaces must be capable of refetching current persisted data.

Do not assume every event will always be received.

---

## 29. Documentation Changes

Update canonical documentation when accepted behavior changes.

Examples:

### Business behavior

Update relevant:

```text
docs/domain/business-rules.md
docs/domain/order-lifecycle.md
docs/product/user-stories.md
```

### Architecture

Update:

```text
docs/architecture/
```

and create/update an ADR when appropriate.

### Security

Update relevant:

```text
docs/architecture/security.md
docs/quality/security-strategy.md
docs/quality/threat-model.md
```

Do not silently let implementation diverge from documented decisions.

---

## 30. Git

Use Conventional Commits.

Examples:

```text
feat(orders): add atomic order creation
test(security): cover customer order isolation
fix(production): prevent quantity overflow
docs(domain): clarify cancellation rules
refactor(catalog): isolate availability mutation
```

Commits should remain focused.

---

## 31. Implementation Prompt Contract

When preparing implementation tasks for AI coding assistants, prefer:

```text
ROLE

OBJECTIVE

PROJECT CONTEXT

REQUIRED READING

TASK

SCOPE

SECURITY & ARCHITECTURE CONSTRAINTS

TESTING REQUIREMENTS

ACCEPTANCE CRITERIA

EXPECTED DELIVERABLE
```

State explicitly what must not be modified when scope boundaries matter.

---

## 32. Implementation Completion Report

At the end of an implementation task, report:

### Files Changed

List created or modified files.

### Behavior

Explain what was implemented.

### Decisions

Explain meaningful implementation decisions.

### Tests

List commands actually executed and their results.

### Security

Describe relevant authorization/security verification.

### Remaining Limitations

Report unresolved or intentionally deferred behavior.

Never claim a command passed unless it was executed successfully.

---

## 33. Release Rule

Before significant public releases:

- Run full automated tests.
- Review RLS.
- Review RPC permissions.
- Review SECURITY DEFINER functions.
- Review dependencies.
- Review secrets.
- Review threat model.
- Perform OWASP-oriented review.
- Complete `docs/quality/release-checklist.md`.

Critical and High security defects block release by default.

---

## 34. Final Rule

When uncertain:

1. Preserve data.
2. Preserve security.
3. Preserve documented business rules.
4. Keep the change small.
5. Ask or report rather than silently inventing architecture.

The goal is not to generate the most code.

The goal is to build a secure, understandable, maintainable real-world product.