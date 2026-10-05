# Business Rules — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Product & Domain Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document defines the business rules and invariants governing the Bakery Orders MVP.

Rules are identified using stable IDs and grouped by functional domain.

Critical rules must be enforced by trusted backend mechanisms, not exclusively by the React interface.

Relevant rules must be covered by automated tests.

This document is the functional reference for designing domain logic, PostgreSQL constraints, RPC functions, authorization policies, and validation schemas.

---

# Authentication & Authorization

### BR-AUTH-001

Supported MVP roles are:

- CUSTOMER
- KITCHEN
- MANAGER

### BR-AUTH-002

Authentication is mandatory for accessing private operational information.

### BR-AUTH-003

A CUSTOMER must be associated with an authorized external establishment.

### BR-AUTH-004

A CUSTOMER may only access orders and private information belonging to their authorized establishment.

### BR-AUTH-005

KITCHEN may access operational production information across the bakery's establishments.

KITCHEN must not receive unrelated administrative permissions.

### BR-AUTH-006

MANAGER may access operational information across all registered establishments.

Administrative capabilities require explicit authorization.

### BR-AUTH-007

Deactivated establishments cannot create new orders.

Their historical information must remain preserved.

### BR-AUTH-008

Public unrestricted self-registration is not supported in the MVP.

User onboarding must follow a controlled authorization process.

### BR-AUTH-009

Frontend route protection is insufficient on its own.

Sensitive operations and database access must enforce authorization server-side.

---

# Product Catalog

### BR-CATALOG-001

Each product must have a unique identifier and belong to a valid category.

### BR-CATALOG-002

Products must preserve their measurement or packaging unit.

Quantity validation must respect the supported unit and its precision.

### BR-CATALOG-003

Product prices are excluded from MVP functionality.

### BR-CATALOG-004

Product activation and availability are separate concepts.

An inactive product is administratively disabled.

An unavailable product remains part of the catalog but cannot be selected for new confirmed orders.

### BR-CATALOG-005

Only MANAGER can create, edit, and administratively deactivate products or categories.

### BR-CATALOG-006

KITCHEN and MANAGER can modify product availability.

KITCHEN availability permissions must not grant unrestricted catalog administration access.

### BR-CATALOG-007

Only active and available products may be included in a newly confirmed order.

Availability must be revalidated during submission.

### BR-CATALOG-008

Changes to product names, descriptions, categories, or availability must not silently modify historical confirmed orders.

### BR-CATALOG-009

Catalog administration must preserve historical referential integrity.

Products referenced by historical orders must not be physically deleted through ordinary administrative actions.

---

# Shopping Cart

### BR-CART-001

A cart represents an editable selection of products.

It is not a confirmed order.

### BR-CART-002

A cart may contain multiple products.

Each product entry must include a valid requested quantity.

### BR-CART-003

Requested quantities must be greater than zero and respect product unit precision.

### BR-CART-004

CUSTOMER may modify, remove, or clear cart items before order confirmation.

### BR-CART-005

An empty cart cannot be confirmed.

### BR-CART-006

Repeating a previous order must populate a new editable cart.

The original order must remain unchanged.

Repeating an order must never submit it automatically.

---

# Order Management

### BR-ORDER-001 — Minimum Order Content

A confirmed order must contain at least one valid order item.

### BR-ORDER-002 — Product Validation

Every submitted product must be active and available at the time of order confirmation.

Availability must be validated by trusted backend logic.

### BR-ORDER-003 — Historical Snapshot

Confirmed order items must preserve the relevant product information as it existed when the order was created.

At minimum:

- Original product identifier.
- Original product name.
- Requested quantity.
- Measurement or packaging unit.

### BR-ORDER-004 — Establishment Ownership

Every order must belong to a valid external establishment.

The establishment must be derived from the authenticated user's authorized context rather than trusting arbitrary client-submitted ownership information.

### BR-ORDER-005 — Partial Fulfillment

KITCHEN may partially fulfill an order when the requested quantity cannot be supplied.

- Original requested quantities must be preserved.
- Unavailable quantities must be recorded explicitly.
- A reason for each reduction operation is mandatory.
- CUSTOMER must be informed through the application.
- MANAGER must have visibility of the incident.
- CUSTOMER approval is not required.
- Partial fulfillment must not block normal preparation or dispatch of the remaining supplyable quantities.
- The operation must generate an audit event.

### BR-ORDER-006 — Dispatch Authorization

Only an authorized KITCHEN employee may mark a READY order as DISPATCHED.

A dedicated courier role is not required in the MVP.

The operation must record the responsible actor and timestamp.

### BR-ORDER-007 — Cancellation

CUSTOMER may cancel an order only while its operational status is RECEIVED.

Once preparation begins, cancellation requires MANAGER authorization.

All cancellations must:

- Preserve the order record.
- Require a reason.
- Record the responsible actor.
- Record the cancellation timestamp.
- Generate an audit event.

Cancellation must respect the approved order lifecycle.

Post-dispatch exceptions require a separately defined resolution policy.

### BR-ORDER-008 — Total Unavailability

An order for which no requested quantity can be supplied must not be marked READY.

The situation requires MANAGER intervention.

The order must not proceed through normal dispatch while this condition remains unresolved.

### BR-ORDER-009 — Atomic Creation

Creating an order, its items, and its initial audit event must be an atomic operation.

Partial creation is not permitted.

### BR-ORDER-010 — Initial Status

Every successfully confirmed order must initially have the operational status RECEIVED.

### BR-ORDER-011 — Duplicate Prevention

Order submission must provide an idempotency mechanism.

Repeating the same submission must not create multiple orders unintentionally.

A new intentional submission must remain possible.

### BR-ORDER-012 — Original Quantity Preservation

Original requested quantities must not be overwritten by preparation or fulfillment operations.

### BR-ORDER-013 — Delivery Information

Every confirmed order must include a requested delivery date and time.

Specific scheduling windows and cutoff rules remain subject to business validation.

### BR-ORDER-014 — Order Ownership Security

CUSTOMER must not read, modify, cancel, repeat, or confirm receipt of orders belonging to an unrelated establishment.

---

# Production & Fulfillment

### BR-PROD-001 — Quantity Invariant

For each order item:

- Requested quantity must be greater than zero.
- Prepared quantity must be non-negative.
- Unavailable quantity must be non-negative.
- Prepared quantity plus unavailable quantity must never exceed requested quantity.

The remaining unresolved quantity is calculated as:

`requestedQuantity - preparedQuantity - unavailableQuantity`

### BR-PROD-002 — Preparation Start

Preparation may begin only from the RECEIVED status.

Starting preparation changes the order to IN_PROGRESS.

### BR-PROD-003 — Quantity Tracking

KITCHEN may register partial prepared quantities while the order is IN_PROGRESS.

Preparation progress must be stored persistently.

### BR-PROD-004 — Unavailability Reason

Every operation that registers an unavailable quantity must include a non-empty reason.

The affected order item, quantity, responsible actor, and timestamp must be preserved.

### BR-PROD-005 — Fulfillment Completion

An order may transition to READY only when:

- All order items have zero unresolved quantity.
- At least one requested quantity has been prepared successfully.
- No unresolved total-unavailability incident blocks the operation.

### BR-PROD-006 — Fulfillment Classification

Operational status and fulfillment condition represent different concepts.

Once all item quantities have been resolved, fulfillment can be classified as:

- COMPLETE: All requested quantities were prepared.
- PARTIAL: Some requested quantities were unavailable, but at least one quantity was prepared.
- UNAVAILABLE: No requested quantity can be supplied.

Orders with unresolved quantities must not be represented as fully fulfilled.

### BR-PROD-007 — Existing Orders

Changing global product availability must not automatically cancel, reduce, or modify existing confirmed orders.

Individual order fulfillment must be managed through its own controlled operations.

### BR-PROD-008 — Production Auditability

Significant preparation and fulfillment changes must identify:

- Responsible user.
- Affected order.
- Affected item, when applicable.
- Previous and new values, when relevant.
- Timestamp.

### BR-PROD-009 — Quantity Integrity

An employee cannot mark unavailable quantities as prepared without an authorized correction operation.

Corrections, when supported, must preserve an audit trail rather than silently replacing historical events.

---

# Order Lifecycle

### BR-LIFE-001 — Primary States

Supported operational states are:

- RECEIVED
- IN_PROGRESS
- READY
- DISPATCHED
- DELIVERED
- CANCELLED

### BR-LIFE-002 — Standard Transitions

The normal successful lifecycle is:

RECEIVED → IN_PROGRESS → READY → DISPATCHED → DELIVERED

### BR-LIFE-003 — Transition Authorization

Every transition must verify:

- Current order status.
- Requested target status.
- Authenticated actor.
- Required business conditions.

### BR-LIFE-004 — Receipt Confirmation

Only an authorized CUSTOMER associated with the receiving establishment may confirm physical receipt.

Receipt confirmation is permitted only when the order is DISPATCHED.

### BR-LIFE-005 — Terminal States

DELIVERED and CANCELLED are terminal states for the normal MVP lifecycle.

Further exceptional operations require explicitly defined rules.

### BR-LIFE-006 — Invalid Transitions

The application must reject invalid status transitions.

For example, RECEIVED cannot transition directly to DELIVERED.

### BR-LIFE-007 — State Persistence

Successful state transitions must be persisted and reflected consistently across authorized user interfaces.

### BR-LIFE-008 — Cancellation History

Cancellation must preserve historical order and production information.

Normal application actions must not physically remove cancelled orders.

---

# Customer Tracking & History

### BR-TRACK-001

CUSTOMER may consult active and historical orders belonging to their authorized establishment.

### BR-TRACK-002

Relevant production and fulfillment changes must become visible through the customer interface.

### BR-TRACK-003

Fulfillment notifications must not depend exclusively on a temporary Realtime connection.

Relevant information must remain available after reconnecting.

### BR-TRACK-004

Partial fulfillment does not require CUSTOMER approval and must not independently block dispatch.

### BR-TRACK-005

A historical order must preserve original requested quantities and its recorded final fulfillment information.

### BR-TRACK-006

When repeating a historical order, current product availability must be checked.

Unavailable or inactive products must be identified before the new order is confirmed.

---

# Establishment Management

### BR-BUSINESS-001

Only MANAGER may create, edit, activate, or deactivate establishments through the administrative interface.

### BR-BUSINESS-002

An establishment may have authorized users associated with it.

Membership and access permissions must be explicitly verified.

### BR-BUSINESS-003

Deactivating an establishment must not physically remove its historical orders.

### BR-BUSINESS-004

Inactive establishments must not create new orders.

### BR-BUSINESS-005

Establishment administration must not expose unrelated authentication secrets or private information.

---

# Auditability

### BR-AUDIT-001

Significant operational actions must be auditable.

### BR-AUDIT-002

Audit events must include:

- Event identifier.
- Event type.
- Affected entity or order.
- Responsible actor.
- Timestamp.
- Relevant change information.

### BR-AUDIT-003

At minimum, the system must audit:

- Order creation.
- Order cancellation.
- Preparation start.
- Prepared quantity changes.
- Unavailable quantity registration.
- Order lifecycle transitions.
- Dispatch confirmation.
- Receipt confirmation.

### BR-AUDIT-004

Audit timestamps and actor identity must be established by trusted backend logic.

The client must not be allowed to impersonate arbitrary actors.

### BR-AUDIT-005

Operational users must not be permitted to arbitrarily modify or delete historical audit events.

### BR-AUDIT-006

MANAGER must have access to relevant operational audit information.

### BR-AUDIT-007

Audit metadata must not unnecessarily expose credentials, access tokens, or sensitive authentication information.

---

# Security & Data Integrity

### BR-SEC-001

Critical permissions must be enforced server-side through appropriate database authorization and trusted functions.

### BR-SEC-002

Row Level Security must prevent unauthorized cross-establishment data access.

### BR-SEC-003

Privileged Supabase credentials must never be exposed in client-side code.

### BR-SEC-004

Client-side validation does not replace trusted backend validation.

### BR-SEC-005

Critical business operations must preserve data integrity under concurrent requests.

### BR-SEC-006

Failed operations must not be presented to users as successful.

### BR-SEC-007

Security-sensitive changes require automated verification, particularly for authentication, authorization, RLS, and privileged database functions.

### BR-SEC-008

A security review based on OWASP Top 10:2025, supported by applicable ASVS requirements, is mandatory before the first public release and significant subsequent releases.

---

# Business Rule Enforcement

Business rules must be implemented at the appropriate architectural level.

| Concern | Primary enforcement |
|---|---|
| Form input structure | Zod |
| User experience and feedback | React |
| Authorization | Supabase Auth + PostgreSQL RLS |
| Order creation invariants | Trusted PostgreSQL RPC |
| Quantity constraints | PostgreSQL constraints and transactional operations |
| Lifecycle transitions | Trusted backend operations |
| Audit persistence | Trusted backend/database operations |
| Realtime synchronization | Supabase Realtime |

Frontend validation may duplicate selected checks to improve user experience.

However, the frontend must not be the exclusive enforcement point for critical rules.

---

## Pending Domain Decisions

The following details must be resolved before implementing their associated features:

1. Exact date/time scheduling restrictions.
2. Exact authentication and establishment onboarding experience.
3. Correction workflow for quantities registered incorrectly by KITCHEN.
4. Exceptional handling of delivery disputes or failed delivery after DISPATCHED.
5. Detailed transition matrix for exceptional managerial cancellation.

Unresolved decisions must not be silently invented by implementation agents.

Any accepted change to these rules must be reflected in this document and its associated automated tests.