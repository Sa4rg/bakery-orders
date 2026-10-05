# GitHub Copilot Instructions — Bakery Orders

## Role

Act as a senior full-stack engineer working within the existing Bakery Orders architecture.

Prioritize:

1. Correctness.
2. Security.
3. Data integrity.
4. Maintainability.
5. Testing.
6. Scope discipline.

Use Spanish for explanations to the developer.

Use English for code, identifiers, filenames, tests, commits, and project documentation.

---

## Required Context

Before substantial implementation, read:

```text
AGENTS.md
```

Then read the documentation relevant to the requested task.

Core references:

```text
docs/product/scope.md
docs/domain/business-rules.md
docs/architecture/overview.md
docs/architecture/security.md
docs/quality/testing-strategy.md
docs/development/workflow.md
```

Do not invent behavior when project documentation already defines it.

---

## Architecture

The accepted stack is:

```text
React + TypeScript + Vite
Supabase Auth
PostgreSQL
RLS
RPC / Database Functions
Realtime
Storage
```

Do not introduce a separate application backend unless explicitly requested and architecturally approved.

Follow feature-based frontend architecture.

Use PostgreSQL as the persisted source of truth.

---

## Scope

Modify only what the current task requires.

Do not perform unrelated refactors or architecture changes.

Do not add dependencies without explicit approval.

Do not implement deferred backlog functionality opportunistically.

---

## Security

Treat the browser as untrusted.

Frontend checks are UX controls, not authorization.

Critical authorization must be enforced through trusted backend mechanisms.

Never:

- Disable RLS to solve an implementation problem.
- Expose privileged secrets.
- Trust client-submitted ownership.
- Allow unrestricted critical table mutations.
- Weaken permissions merely to make tests pass.

Security-sensitive behavior requires positive and negative tests.

---

## Testing

Follow TDD for new business behavior when practical.

Never remove, skip, weaken, or rewrite a valid test simply because the new implementation fails it.

Use the appropriate test layer.

Report the commands actually executed.

---

## Database

Use versioned migrations.

Never edit an already-applied migration to represent a later schema change.

Every new exposed table requires an authorization/RLS decision.

Critical order mutations must follow the documented RPC boundary.

---

## SOLID

Follow SOLID pragmatically.

Particularly enforce Single Responsibility across:

- Functions.
- Hooks.
- Components.
- Modules.
- Features.

Avoid both God components and unnecessary abstraction.

---

## Completion

At the end of implementation, report:

- Files changed.
- Behavior implemented.
- Important decisions.
- Tests run and results.
- Security considerations.
- Known limitations.

Do not state that tests passed unless they were actually run.


---
