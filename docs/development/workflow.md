# Development Workflow — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Development Process Definition
**Status:** Active
**Version:** 1.0

---

## 1. Purpose

This document defines the standard development workflow for Bakery Orders.

It applies to:

- Human contributors.
- GitHub Copilot.
- ChatGPT-assisted development.
- Future AI coding agents.

The objective is to keep implementation:

- Controlled.
- Traceable.
- Secure.
- Testable.
- Incremental.
- Consistent with accepted product and architecture decisions.

Implementation speed must never take priority over correctness, security, or maintainability.

---

# 2. Development Principles

All work follows these principles:

1. Understand before modifying.
2. Work within explicit scope.
3. Prefer small, reviewable increments.
4. Follow accepted architecture.
5. Apply SOLID pragmatically.
6. Emphasize Single Responsibility.
7. Use TDD for business behavior.
8. Protect authorization server-side.
9. Never bypass failing tests by weakening them.
10. Never silently change architecture.
11. Never silently expand scope.
12. Document meaningful decisions.
13. Verify work before declaring it complete.

---

# 3. Required Reading Before Implementation

Before implementing a task, contributors must read the documentation relevant to that task.

At minimum:

```text
docs/product/scope.md
docs/domain/business-rules.md
docs/architecture/overview.md
```

Additional required reading depends on the task.

## Order or Production Work

Read:

```text
docs/domain/order-lifecycle.md
docs/domain/domain-model.md
docs/architecture/data-model.md
```

## Authentication or Authorization Work

Read:

```text
docs/architecture/security.md
docs/quality/security-strategy.md
docs/quality/threat-model.md
```

## Database Work

Read:

```text
docs/architecture/data-model.md
docs/architecture/security.md
docs/quality/testing-strategy.md
```

## Release-Critical Work

Read:

```text
docs/quality/release-checklist.md
```

Implementation agents must not rely solely on prior conversation context when canonical project documentation exists.

---

# 4. Task Definition

Every implementation task should define:

- Objective.
- Business context.
- Required reading.
- Exact scope.
- Allowed files or modules when appropriate.
- Constraints.
- Testing requirements.
- Security considerations.
- Acceptance criteria.
- Expected deliverable.

Large ambiguous implementation requests should be decomposed before coding.

---

# 5. Scope Discipline

Only modify code directly required by the current task.

Do not perform:

- Opportunistic refactors.
- Unrelated cleanup.
- Architecture rewrites.
- Dependency upgrades unrelated to the task.
- Formatting changes across unrelated files.
- Renaming unrelated modules.

If a necessary change falls outside the original scope:

1. Identify it.
2. Explain why it is required.
3. Evaluate its impact.
4. Expand the task explicitly before implementation.

This protects reviewability and reduces regression risk.

---

# 6. Architecture Discipline

Accepted architecture must be followed.

Contributors must not independently introduce:

- A custom backend server.
- A new global state-management library.
- A repository abstraction layer.
- A dependency injection framework.
- Microservices.
- Event sourcing.
- New persistence strategies.
- Alternative authentication architecture.

Significant architectural changes require:

- Justification.
- Discussion.
- ADR update or new ADR.
- Security impact analysis.
- Testing impact analysis.

---

# 7. Dependency Policy

New runtime or development dependencies require explicit justification.

Before adding a dependency:

1. Confirm the problem cannot reasonably be solved with existing tools.
2. Evaluate native or platform alternatives.
3. Check project maintenance.
4. Consider security implications.
5. Consider bundle or operational impact.
6. Obtain approval where required.

Do not install dependencies preemptively.

---

# 8. Standard Implementation Cycle

The preferred development cycle is:

```text
Understand
    ↓
Plan
    ↓
Write/Update Tests
    ↓
Implement
    ↓
Refactor
    ↓
Run Verification
    ↓
Security Review
    ↓
Document Changes
```

---

# 9. Step 1 — Understand

Before coding:

- Read relevant documentation.
- Identify affected business rules.
- Identify affected user stories.
- Identify security boundaries.
- Identify persistence implications.
- Identify expected tests.

Do not begin implementation while critical business behavior is still being invented.

---

# 10. Step 2 — Plan

For non-trivial work, define a small implementation plan.

A good plan identifies:

- Files expected to change.
- New behavior.
- Tests to add.
- Database changes.
- Security impact.
- Potential risks.

The plan should remain proportional to the task.

Small tasks do not require excessive documentation.

---

# 11. Step 3 — TDD

For business behavior:

```text
RED
→ failing test

GREEN
→ minimum correct implementation

REFACTOR
→ improve design while preserving behavior
```

Tests should be written at the lowest useful level.

Examples:

| Behavior | Preferred Test |
|---|---|
| Fulfillment calculation | Unit |
| Form validation | Unit / Component |
| RLS policy | pgTAP |
| RPC lifecycle rule | Database |
| Critical user workflow | Playwright |

---

# 12. Step 4 — Implementation

Implementation must:

- Respect existing module ownership.
- Preserve Single Responsibility.
- Avoid unnecessary abstractions.
- Use explicit names.
- Keep security checks at trusted boundaries.
- Keep components focused.
- Keep database operations controlled.

Code should be easy to review.

---

# 13. Single Responsibility Rule

A function, component, hook, module, or feature should have one cohesive responsibility and one meaningful reason to change.

This does not mean every function must be tiny.

Examples of cohesive responsibilities:

```text
calculateRemainingQuantity()
validateOrderTransition()
createOrder()
useOrderTracking()
OrderStatusBadge
```

Warning signs:

- Component handles unrelated data domains.
- Hook performs authentication, order creation, and catalog mutation.
- Function contains multiple unrelated workflows.
- File changes frequently for unrelated reasons.

Split responsibilities when doing so improves clarity and maintainability.

Do not split code mechanically merely to satisfy a line-count target.

---

# 14. Database Workflow

All database changes use migrations.

Required flow:

```text
Create migration
    ↓
Apply locally
    ↓
Run database tests
    ↓
Run affected integration tests
    ↓
Regenerate types
    ↓
Review diff
```

Applied migrations must never be edited to represent later changes.

Create a new migration instead.

---

# 15. Database Change Checklist

Every schema change must consider:

- Foreign keys.
- Constraints.
- Indexes.
- RLS.
- Grants.
- RPC impact.
- Realtime impact.
- Generated TypeScript types.
- Existing data migration.
- Security tests.

A new table is incomplete without an authorization decision.

---

# 16. RPC Development Workflow

Critical RPC work should proceed in this order:

1. Identify business rule.
2. Write database test.
3. Define authorization.
4. Define transaction boundary.
5. Implement function.
6. Verify valid scenario.
7. Verify invalid state.
8. Verify unauthorized caller.
9. Verify audit event.
10. Verify rollback behavior.

If concurrency matters, test or explicitly analyze the race condition.

---

# 17. RLS Workflow

For every new RLS policy:

```text
Allowed case
+
Denied case
```

must be tested.

Example:

```text
CUSTOMER A reads Order A → allowed
CUSTOMER A reads Order B → denied
```

A policy without negative testing is incomplete.

---

# 18. Frontend Workflow

Frontend feature implementation should generally follow:

```text
Domain type/rule
      ↓
Schema
      ↓
Data function
      ↓
Application hook/use case
      ↓
Component
      ↓
Page
```

Not every feature requires every layer.

Do not create empty layers.

---

# 19. Form Workflow

Forms use:

- React Hook Form.
- Zod.

Process:

```text
User Input
    ↓
React Hook Form
    ↓
Zod Validation
    ↓
Application Command
    ↓
Trusted Backend Validation
```

Frontend validation improves UX.

It never replaces backend validation.

---

# 20. Realtime Workflow

Realtime updates should:

1. Receive notification of persisted change.
2. Invalidate or update appropriate client state.
3. Preserve database authority.
4. Recover through refetch after reconnecting.

Realtime handlers must not contain business authority.

---

# 21. Error Handling

Every implementation must consider:

- Loading.
- Success.
- Empty.
- Validation error.
- Authorization error.
- Network failure.
- Unexpected backend error.

Never report an operation as successful before persistence is confirmed.

Production UI must not expose raw SQL or internal stack traces.

---

# 22. Security Review During Development

Security-sensitive changes require explicit review of:

- Authentication.
- Authorization.
- Ownership.
- RLS.
- RPC permissions.
- Input validation.
- Mass assignment.
- Secret exposure.
- Auditability.
- Error handling.

Relevant negative tests are mandatory.

---

# 23. Git Workflow

Development should use focused branches where appropriate.

Suggested branch names:

```text
feature/order-creation
feature/catalog
fix/order-idempotency
security/customer-order-isolation
docs/domain-model
```

Commits follow Conventional Commits.

Examples:

```text
feat(orders): add atomic order creation
fix(production): prevent quantity overflow
test(security): cover cross-business order access
docs(architecture): document RPC boundaries
refactor(catalog): separate availability command
```

Commits should represent coherent changes.

---

# 24. Pull Request Expectations

A pull request should explain:

- What changed.
- Why it changed.
- Relevant business rules.
- Security implications.
- Tests executed.
- Known limitations.

Large PRs should be avoided when functionality can be delivered incrementally.

---

# 25. AI-Assisted Implementation

AI coding tools are assistants, not architectural authorities.

Prompts must provide sufficient context.

Preferred structure:

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

Agents must be told explicitly what they must not modify when necessary.

---

# 26. Agent Implementation Report

After completing an implementation task, an agent should report:

### Changed Files

What files were created or modified.

### Implementation

What behavior was implemented.

### Decisions

Any meaningful implementation decisions.

### Tests

Commands executed and results.

### Security

Relevant security controls or tests.

### Limitations

Anything intentionally left unresolved.

Agents must not claim tests passed unless they were actually executed.

---

# 27. Bug Fix Workflow

When a defect is found:

1. Understand expected behavior.
2. Reproduce the defect.
3. Add a failing regression test where practical.
4. Fix the root cause.
5. Run affected tests.
6. Review similar code paths.
7. Document significant architectural/security findings if applicable.

Avoid symptom-only fixes when the root cause is identifiable.

---

# 28. Refactoring Workflow

Refactoring is permitted when:

- Required for the current task.
- Explicitly requested.
- Necessary to preserve maintainability.

Refactoring must:

- Preserve behavior.
- Keep tests green.
- Remain within agreed scope.

Broad refactors should be separate tasks.

---

# 29. Documentation Workflow

Documentation must change when accepted behavior changes.

Examples:

### Business behavior changed

Update:

```text
business-rules.md
user-stories.md
order-lifecycle.md
```

as applicable.

### Architecture changed

Update:

```text
architecture docs
ADR
```

### Security changed

Update:

```text
security.md
security-strategy.md
threat-model.md
```

Documentation should remain a usable source of truth.

---

# 30. Definition of Done

An implementation task is complete when:

- Scope requirements are satisfied.
- Relevant tests exist.
- Relevant tests pass.
- Type checking passes.
- Lint passes where configured.
- Database tests pass where applicable.
- Security behavior is verified where applicable.
- No unrelated code was changed unnecessarily.
- Documentation was updated when required.
- Modified files and test results are reported.

---

# 31. Release Workflow

Before a significant public release:

```text
Feature Complete
      ↓
Full Test Suite
      ↓
Security Review
      ↓
Threat Model Review
      ↓
OWASP / ASVS Review
      ↓
Release Checklist
      ↓
Production Deployment
      ↓
Post-Deployment Verification
```

The canonical gate is:

```text
docs/quality/release-checklist.md
```

---

# 32. Final Principle

The goal of the development workflow is not process for its own sake.

The goal is to make every change understandable, reviewable, secure, testable, and reversible enough to evolve the system safely.