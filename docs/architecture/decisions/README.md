Architecture Decision Register — Bakery Orders

Project: Bakery Orders
Phase: Sprint 0 — Architecture Definition
Status: Active
Version: 1.0

1. Purpose

This directory records significant architectural decisions through Architecture Decision Records (ADRs).

ADRs preserve:

Context.

Alternatives.

Selected decision.

Consequences.

Trade-offs.

Rejected approaches.

They prevent architectural decisions from being lost inside chat conversations, commits, or implementation details.

2. ADR Statuses

Supported statuses:

PROPOSED
ACCEPTED
SUPERSEDED
REJECTED

An accepted ADR is not silently rewritten when its decision changes.

A replacement ADR should explain why the original decision was superseded.

3. Initial Decision Register

ID

Decision

Status

ADR-001

Use Supabase as backend platform instead of a custom Node API

ACCEPTED

ADR-002

Use React + TypeScript feature-based architecture

ACCEPTED

ADR-003

Use PostgreSQL RLS for database authorization

ACCEPTED

ADR-004

Use RPC functions for critical transactional mutations

ACCEPTED

ADR-005

Use local Supabase and versioned SQL migrations

ACCEPTED

ADR-006

Treat PostgreSQL as source of truth and Realtime as synchronization

ACCEPTED

ADR-007

Use pragmatic DDD and SOLID instead of heavyweight Clean Architecture

ACCEPTED

ADR-008

Use TDD with Vitest, RTL, pgTAP, Supabase integration tests, and Playwright

ACCEPTED

ADR-009

Preserve immutable order-item product snapshots

ACCEPTED

ADR-010

Derive fulfillment state from order-item quantities

ACCEPTED

ADR-011

Keep cart client-side for MVP V1

ACCEPTED

ADR-012

Use append-oriented OrderEvent audit history

ACCEPTED

4. ADR-001 — Backend Platform

Decision: Supabase provides the backend platform.

Includes:

PostgreSQL.

Auth.

Data API.

RLS.

Realtime.

Storage.

Database Functions.

Edge Functions when necessary.

Rejected initial alternative:

React → Express/NestJS → PostgreSQL

Reason:

The additional server layer does not currently provide sufficient value to justify its operational and implementation cost.

A custom API may be introduced later if concrete requirements justify it.

5. ADR-002 — Frontend Architecture

Decision: Feature-based modular architecture.

Primary structure:

app/
features/
shared/
lib/

Complex features may separate:

domain/
application/
data/
components/
pages/

Reason:

The architecture makes business capabilities visible while preserving local feature ownership.

6. ADR-003 — Authorization

Decision: PostgreSQL RLS is a primary authorization boundary.

React route protection remains UX behavior, not security enforcement.

Reason:

The frontend communicates directly with Supabase and must therefore be treated as untrusted.

7. ADR-004 — Critical Mutations

Decision: Critical business mutations use controlled RPC functions.

Examples:

create_order
start_order
record_prepared_quantity
record_unavailable_quantity
mark_order_ready
dispatch_order
confirm_order_delivery
cancel_order

Reason:

These operations require:

Authorization.

Transactions.

Lifecycle validation.

Quantity invariants.

Audit creation.

Concurrency control.

Direct browser updates would make these invariants harder to guarantee.

8. ADR-005 — Database Development

Decision: Supabase is developed locally first.

Database changes use versioned migrations stored in Git.

Rejected approach:

Using the remote Dashboard as the undocumented primary schema-development workflow.

Reason:

Local migrations provide reproducibility, reviewability, testing, and CI compatibility.

9. ADR-006 — Realtime

Decision: Realtime synchronizes persisted changes.

PostgreSQL remains the source of truth.

Consequence:

Clients must refetch current state after reconnection.

The correctness of the system must not depend on receiving every live event.

10. ADR-007 — DDD and SOLID

Decision: Use pragmatic DDD and SOLID.

The project models explicit domain concepts and responsibilities without introducing unnecessary enterprise patterns.

Rejected approaches:

Architecture with dozens of empty interfaces.

Repository abstraction around every trivial query.

Dependency injection container without need.

Microservices.

11. ADR-008 — Testing

Decision: Testing is mandatory and business behavior follows TDD.

Tools:

Vitest
React Testing Library
Supabase local
pgTAP
Playwright

Security and business invariants require negative as well as positive tests.

12. ADR-009 — Historical Product Snapshots

Decision: OrderItem preserves relevant product information at confirmation time.

Initial snapshots:

product_name_snapshot
unit_code_snapshot
quantity_step_snapshot

Reason:

Historical orders must remain correct when catalog data changes.

13. ADR-010 — Fulfillment State

Decision: Fulfillment condition is initially derived.

It is calculated from:

requested_quantity
prepared_quantity
unavailable_quantity

No independent mutable fulfillment-status column is required initially.

Reason:

Avoid redundant state and inconsistency.

14. ADR-011 — Cart Persistence

Decision: Cart is initially client-side.

A persistent cart table is not part of MVP V1.

Reason:

The confirmed Order is the business record.

Cross-device cart synchronization is not a current requirement.

15. ADR-012 — Audit Model

Decision: OrderEvent records significant order operations.

The system is not event-sourced.

Current state remains stored directly on Order and OrderItem.

OrderEvent provides operational history and auditability.

16. Decisions Still Requiring ADRs

Potential future decisions include:

Authentication method for external businesses.

Customer onboarding workflow.

Frontend server-state library, if one is required.

Persistent cart, if required.

Business-specific catalogs.

Product variants.

External notifications.

Paid infrastructure migration.

Delivery incident workflow.

Advanced backup and disaster recovery strategy.

No implementation agent may decide these architecture changes silently.

17. ADR Template

New ADR files should follow:

ADR-XXX-short-decision-name.md

Template:

# ADR-XXX — Decision Title

Status: PROPOSED

## Context

What problem requires a decision?

## Decision

What approach was selected?

## Alternatives Considered

What alternatives were evaluated?

## Consequences

What are the benefits, costs, and limitations?

## Security Impact

Does the decision affect the security model?

## Testing Impact

What must be tested?

## Migration / Rollback

How can this decision be introduced or reversed?

18. Decision Discipline

Architectural decisions should be documented when they significantly affect:

System boundaries.

Security.

Data ownership.

Persistence.

Dependencies.

Deployment.

Testing strategy.

Long-term maintainability.

Minor implementation choices do not require an ADR.

The purpose of ADRs is architectural memory, not bureaucratic overhead.