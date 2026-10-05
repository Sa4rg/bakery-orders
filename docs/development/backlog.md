# Development Backlog — Bakery Orders

**Project:** Bakery Orders
**Status:** Active Planning Document
**Version:** 1.0

---

## 1. Purpose

This document defines the initial implementation sequence for the Bakery Orders MVP.

It translates the accepted product, domain, architecture, quality, and security decisions into incremental development milestones.

The backlog is intentionally prioritized around vertical business value.

The objective is to produce a demonstrable end-to-end workflow early instead of building every module horizontally before integration.

---

# 2. Prioritization Principles

Backlog priority follows:

1. Architecture and development foundation.
2. Authentication and authorization.
3. Catalog required for ordering.
4. Complete order vertical slice.
5. Production workflow.
6. Customer tracking.
7. Management capabilities.
8. Operational hardening.
9. Release security gate.

Critical security infrastructure must not be postponed until the end.

---

# 3. MVP Milestones

```text
M0 — Project Foundation
M1 — Identity & Authorization
M2 — Catalog
M3 — Customer Ordering
M4 — Kitchen Production
M5 — Tracking & Delivery
M6 — Management
M7 — History & Repeat Order
M8 — Hardening
M9 — First Public Demo / Release
```

---

# 4. M0 — Project Foundation

**Objective:** Establish a reproducible and testable development environment.

## M0-001 — Initialize Frontend

Create:

- React.
- TypeScript.
- Vite.
- pnpm project.

Configure basic scripts.

## M0-002 — Establish Folder Structure

Create only required initial boundaries:

```text
src/app
src/features
src/shared
src/lib
```

Do not create empty feature architecture unnecessarily.

## M0-003 — Configure Code Quality

Configure:

- TypeScript strictness.
- ESLint.
- Formatting policy if selected.
- Build script.
- Typecheck script.

## M0-004 — Configure Vitest

Create first unit test and confirm test execution.

## M0-005 — Configure React Testing Library

Create first representative component test.

## M0-006 — Initialize Local Supabase

Configure:

```text
supabase/
```

and confirm local services start successfully.

## M0-007 — Configure Database Tests

Introduce pgTAP test structure.

Verify:

```text
supabase test db
```

works locally.

## M0-008 — Configure Playwright

Create initial application smoke test.

## M0-009 — Environment Configuration

Create safe:

```text
.env.example
```

and ignore real environment files.

## M0-010 — Initial CI

Configure initial CI quality gates:

- Install.
- Lint.
- Typecheck.
- Unit tests.
- Build.

Database and E2E CI may be introduced incrementally as infrastructure becomes available.

### M0 Acceptance Criteria

- Application starts locally.
- Local Supabase starts.
- Unit tests run.
- Database tests run.
- Build succeeds.
- No secrets are committed.

---

# 5. M1 — Identity & Authorization

**Objective:** Establish the security boundary before business data is exposed.

Related stories:

```text
US-AUTH-001
US-AUTH-002
US-AUTH-003
US-AUTH-004
US-AUTH-005
```

## M1-001 — Profiles Schema

Implement:

```text
profiles
```

with migration and tests.

## M1-002 — Businesses Schema

Implement:

```text
businesses
```

with constraints and tests.

## M1-003 — Business Memberships

Implement:

```text
business_memberships
```

with uniqueness and authorization model.

## M1-004 — Initial Roles

Implement:

```text
CUSTOMER
KITCHEN
MANAGER
```

through trusted assignment.

## M1-005 — Authentication UI

Implement selected authentication mechanism.

Authentication UX requires accepted architectural decision before implementation.

## M1-006 — Session Handling

Implement:

- Session restoration.
- Logout.
- Protected layouts.

## M1-007 — RLS Foundation

Implement and test policies for:

- Profiles.
- Businesses.
- Memberships.

## M1-008 — Cross-Business Isolation Tests

Prove CUSTOMER cannot access unrelated Business data.

### M1 Acceptance Criteria

- Users authenticate.
- Roles resolve correctly.
- CUSTOMER access is associated with authorized Business.
- Cross-business access fails at backend level.

---

# 6. M2 — Catalog

**Objective:** Provide the product data required for customer ordering.

Related stories:

```text
US-CATALOG-001
US-CATALOG-002
US-CATALOG-003
US-CATALOG-004
```

## M2-001 — Categories Schema

Implement migration, RLS, and tests.

## M2-002 — Products Schema

Implement:

- Category.
- Unit code.
- Quantity step.
- Active state.
- Availability.
- Image path.

## M2-003 — Fictional Seed Catalog

Create realistic development catalog.

No real business data required.

## M2-004 — Customer Catalog Query

Implement authorized catalog reads.

## M2-005 — Catalog UI

Implement:

- Product cards.
- Categories.
- Search.
- Filters.
- Availability states.

## M2-006 — Manager Catalog Administration

Implement controlled product/category CRUD.

## M2-007 — Kitchen Availability Command

Implement restricted availability-only operation.

KITCHEN must not gain arbitrary product mutation permissions.

## M2-008 — Product Images

Add Storage integration when required by the catalog UI.

### M2 Acceptance Criteria

- CUSTOMER can browse current catalog.
- Unavailable products are clearly identified.
- KITCHEN can change availability only.
- MANAGER can administer catalog.
- Historical behavior is not yet relevant because confirmed orders do not exist.

---

# 7. M3 — Customer Ordering

**Objective:** Deliver the first major customer workflow.

Related stories:

```text
US-CART-001
US-CART-002
US-CART-003
US-ORDER-001
US-ORDER-002
US-ORDER-003
```

## M3-001 — Order Schema

Implement:

```text
orders
order_items
order_events
```

with constraints.

## M3-002 — Order Item Quantity Constraints

Test:

```text
requested > 0
prepared >= 0
unavailable >= 0
prepared + unavailable <= requested
```

## M3-003 — Order Snapshot Strategy

Persist:

```text
product_name_snapshot
unit_code_snapshot
quantity_step_snapshot
```

## M3-004 — Create Order RPC

Implement atomic order creation.

Must include:

- Authentication.
- Membership validation.
- Product revalidation.
- Quantity validation.
- Idempotency.
- Item creation.
- Initial audit event.

## M3-005 — Order Creation Security Tests

Test:

- Wrong Business.
- Inactive Business.
- Inactive membership.
- Unavailable product.
- Invalid quantity.
- Duplicate submission.

## M3-006 — Cart

Implement customer cart.

## M3-007 — Review Order

Implement confirmation screen.

## M3-008 — Submit Order

Integrate cart with `create_order`.

## M3-009 — Confirmation UX

Show successful persisted order.

### M3 Acceptance Criteria

CUSTOMER can:

```text
Login
→ Browse catalog
→ Add products
→ Review cart
→ Confirm
→ Receive persisted order confirmation
```

At this milestone, a complete new Order exists securely in PostgreSQL.

---

# 8. M4 — Kitchen Production

**Objective:** Make newly created orders operationally useful.

Related stories:

```text
US-PROD-001
US-PROD-002
US-PROD-003
US-PROD-004
US-PROD-005
US-PROD-006
US-PROD-008
US-PROD-009
```

## M4-001 — Kitchen Order Query

Provide production queue with:

- Establishment.
- Delivery time.
- Status.
- Order details.

## M4-002 — Realtime Incoming Orders

Synchronize new orders.

## M4-003 — Start Order RPC

Implement:

```text
RECEIVED → IN_PROGRESS
```

with authorization and audit.

## M4-004 — Prepared Quantity RPC

Implement controlled quantity updates.

## M4-005 — Unavailable Quantity RPC

Implement:

- Quantity.
- Mandatory reason.
- Audit event.
- Invariant enforcement.

## M4-006 — Production UI

Display:

- Requested.
- Prepared.
- Unavailable.
- Remaining.

## M4-007 — Fulfillment Calculation

Implement derived:

```text
COMPLETE
PARTIAL
UNAVAILABLE
```

## M4-008 — Ready Order RPC

Require:

- Zero remaining.
- Prepared > 0.
- Valid lifecycle.

## M4-009 — Total Unavailability

Reject READY and expose Manager intervention requirement.

## M4-010 — Production Concurrency Tests

Verify simultaneous quantity operations cannot violate invariants.

### M4 Acceptance Criteria

KITCHEN can receive and process an order securely from `RECEIVED` to `READY`.

Both complete and partial fulfillment work.

---

# 9. M5 — Tracking & Delivery

**Objective:** Complete the primary end-to-end lifecycle.

Related stories:

```text
US-PROD-007
US-TRACK-001
US-TRACK-002
US-TRACK-003
```

## M5-001 — Customer Active Orders

CUSTOMER sees current establishment orders.

## M5-002 — Tracking UI

Display:

- Status.
- Item progress.
- Shortages.
- Reasons.

## M5-003 — Tracking Realtime

Synchronize persisted production changes.

## M5-004 — Dispatch RPC

Implement:

```text
READY → DISPATCHED
```

for authorized KITCHEN.

## M5-005 — Receipt RPC

Implement:

```text
DISPATCHED → DELIVERED
```

for authorized CUSTOMER belonging to the correct Business.

## M5-006 — Delivery Security Tests

Test wrong Business and invalid lifecycle.

## M5-007 — Critical Happy-Path E2E

Automate:

```text
CUSTOMER order
→ KITCHEN production
→ READY
→ DISPATCHED
→ CUSTOMER DELIVERED
```

## M5-008 — Partial Fulfillment E2E

Automate complete partial-order scenario.

### M5 Acceptance Criteria

The complete core business workflow is demonstrable end-to-end.

This is the first major demo-ready vertical slice.

---

# 10. M6 — Management

**Objective:** Provide operational supervision and administration.

Related stories:

```text
US-MGMT-001
US-MGMT-002
US-MGMT-003
US-MGMT-004
US-MGMT-005
```

## M6-001 — Management Dashboard

Display:

- Current order counts.
- Statuses.
- Active production.
- Incidents.

## M6-002 — Order Search & Filters

Support:

- Establishment.
- Date.
- Status.

## M6-003 — Partial Fulfillment Visibility

Highlight shortages and reasons.

## M6-004 — Establishment Administration

Implement:

- Create.
- Edit.
- Activate/deactivate.

## M6-005 — Manager Cancellation RPC

Implement cancellation before dispatch.

## M6-006 — Audit History

Expose appropriate order event history.

## M6-007 — Authorization Tests

Verify KITCHEN/CUSTOMER cannot access Manager-only operations.

### M6 Acceptance Criteria

MANAGER can supervise the complete ordering operation without using a KITCHEN account.

---

# 11. M7 — History & Repeat Order

**Objective:** Optimize recurring B2B ordering.

Related stories:

```text
US-ORDER-004
US-ORDER-005
```

## M7-001 — Customer History

List historical establishment orders.

## M7-002 — Historical Order Detail

Display original and final fulfillment information.

## M7-003 — Repeat Order

Populate new cart from historical order.

## M7-004 — Current Availability Validation

Identify products that are currently inactive or unavailable.

## M7-005 — Repeat Order E2E

Verify:

```text
Historical order
→ Repeat
→ Editable cart
→ Modify
→ Submit new independent order
```

### M7 Acceptance Criteria

Recurring customers can reuse previous purchases without changing history.

---

# 12. M8 — Hardening

**Objective:** Prepare the application for serious demonstration and potential real adoption.

## M8-001 — Error-State Review

Review all major interfaces for:

- Loading.
- Empty.
- Failure.
- Retry.

## M8-002 — Accessibility Review

Review core workflows.

## M8-003 — Responsive Review

Prioritize:

- CUSTOMER mobile.
- KITCHEN practical operational viewport.
- MANAGER desktop/tablet.

## M8-004 — Realtime Recovery

Test reconnect/refetch behavior.

## M8-005 — Performance Review

Review:

- Important queries.
- Indexes.
- Duplicate subscriptions.
- Catalog images.

## M8-006 — Database Security Audit

Review:

- RLS.
- Grants.
- RPCs.
- SECURITY DEFINER.
- Storage.

## M8-007 — Threat Model Review

Update actual threats based on implementation.

## M8-008 — Dependency Review

Review vulnerabilities and unused packages.

## M8-009 — Full Regression Suite

Run complete automated test suite.

### M8 Acceptance Criteria

The application behaves predictably under normal error conditions and passes security-focused review.

---

# 13. M9 — First Public Demo / Release

**Objective:** Produce a safe deployable version suitable for demonstrating to the bakery manager.

## M9-001 — Production Deployment Configuration

Deploy frontend and Supabase environment.

## M9-002 — Demo Seed / Setup

Prepare fictional or explicitly approved demonstration data.

## M9-003 — Full OWASP-Oriented Review

Use:

```text
docs/quality/security-strategy.md
docs/quality/threat-model.md
```

## M9-004 — Release Checklist

Complete:

```text
docs/quality/release-checklist.md
```

## M9-005 — Critical E2E Verification

Run all required release workflows.

## M9-006 — Post-Deployment Smoke Test

Verify:

- Authentication.
- Catalog.
- Representative order creation.
- Permissions.
- Production access.

### M9 Acceptance Criteria

Release status is:

```text
APPROVED
```

or explicitly:

```text
APPROVED WITH DOCUMENTED RISK
```

No unknown Critical or High security issue may be silently accepted.

---

# 14. First Demonstrable Product Target

The highest priority delivery target is not the complete administrative application.

The first demonstrable vertical slice is:

```text
CUSTOMER
Browse Catalog
      ↓
Create Order
      ↓
KITCHEN
Receive Order
      ↓
Start / Prepare
      ↓
READY
      ↓
DISPATCHED
      ↓
CUSTOMER
Confirm Receipt
```

MANAGER must have sufficient visibility into this flow as management functionality is introduced.

This vertical slice should be prioritized before secondary features.

---

# 15. Deferred Backlog

The following are intentionally deferred:

```text
Product pricing
Payments
Invoices
Inventory
Raw materials
Supplier management
Courier role
Delivery route optimization
WhatsApp automation
Email/SMS notifications
Advanced analytics
Multi-bakery SaaS
Native mobile applications
Persistent cross-device cart
Product substitutions
Advanced delivery incidents
```

Deferred items must not appear in the MVP without explicit scope approval.

---

# 16. Backlog Change Policy

A new backlog item must answer:

- What business problem does it solve?
- Is it required for MVP?
- Which existing milestone does it belong to?
- Does it affect architecture?
- Does it affect security?
- Does it require new documentation?
- What tests are required?

New ideas should not automatically become current work.

---

# 17. Task Size

Milestone items are epics or stories, not necessarily implementation-sized tasks.

Before coding, large items should be decomposed.

Example:

```text
M3-004 Create Order RPC
```

may become:

```text
Add failing pgTAP authorization test
Add failing quantity-validation test
Add idempotency uniqueness constraint
Implement RPC
Add audit creation
Add rollback test
Add frontend data function
```

Prefer tasks that can be understood and reviewed independently.

---

# 18. Backlog Status Convention

Tasks may use:

```text
TODO
IN PROGRESS
BLOCKED
DONE
DEFERRED
```

Do not mark a task DONE merely because implementation exists.

The corresponding acceptance criteria and required tests must also pass.

---

# 19. Current Project Position

At the end of Sprint 0 documentation:

```text
Product Definition     DONE
Domain Definition      DONE
Architecture Definition DONE
Quality Definition     DONE
Development Process    DONE
Implementation         NOT STARTED
```

The next step after project-agent documentation is to begin:

```text
M0 — Project Foundation
```

---

# 20. Final Principle

The backlog is ordered to reduce risk while producing demonstrable value early.

We should always prefer:

```text
Small complete vertical capability
```

over:

```text
Many disconnected partially implemented modules
```