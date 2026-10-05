# MVP User Stories

**Project:** Bakery Orders
**Phase:** Sprint 0 — Product & Domain Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document defines the MVP user stories for Bakery Orders.

Stories are grouped by functional area and identified using stable IDs.

Each story describes an expected capability and its minimum acceptance criteria.

Detailed business invariants are maintained separately in `docs/domain/business-rules.md`.

## 2. Actors

- CUSTOMER: Authorized user associated with an external establishment.
- KITCHEN: Authorized bakery production employee.
- MANAGER: Administrative bakery user.

---

# Authentication & Authorization

### US-AUTH-001 — User Authentication

As an authorized user,
I want to authenticate securely,
so that I can access the application according to my assigned permissions.

**Acceptance Criteria:**
- Invalid credentials do not grant access.
- Successful authentication creates a valid session.
- Protected resources cannot be accessed anonymously.

### US-AUTH-002 — Role-Based Experience

As an authenticated user,
I want to access the interface associated with my role,
so that I only interact with relevant functionality.

**Acceptance Criteria:**
- CUSTOMER, KITCHEN, and MANAGER have differentiated access.
- Restricted actions are enforced server-side.
- Frontend route protection is not the only authorization mechanism.

### US-AUTH-003 — Establishment Data Isolation

As a CUSTOMER,
I want to access only my authorized establishment's information,
so that commercial information remains private.

**Acceptance Criteria:**
- Orders belonging to unrelated establishments cannot be accessed.
- Unauthorized direct database/API requests are rejected.
- Access is based on authenticated identity and verified membership.

### US-AUTH-004 — Session Management

As an authenticated user,
I want my session to be handled securely,
so that I can continue working without exposing my account.

**Acceptance Criteria:**
- Valid sessions are restored appropriately.
- Logout ends access to protected application functionality.
- Expired or invalid sessions are handled correctly.

### US-AUTH-005 — Controlled Onboarding

As a MANAGER,
I want external establishments and their authorized users to be registered through a controlled process,
so that unknown users cannot freely access the ordering system.

**Acceptance Criteria:**
- Public unrestricted registration is not available.
- Users are associated with the appropriate establishment.
- Deactivated access cannot continue performing protected actions.

The exact onboarding mechanism will be selected during architecture definition.

---

# Product Catalog

### US-CATALOG-001 — Browse Products

As a CUSTOMER,
I want to browse the bakery catalog,
so that I can identify available products.

**Acceptance Criteria:**
- Products display their name and relevant details.
- The catalog does not display prices.
- Availability is clearly communicated.

### US-CATALOG-002 — Search and Filter

As a CUSTOMER,
I want to search by product name and filter by category,
so that I can find products quickly.

**Acceptance Criteria:**
- Search supports product names.
- Category filtering works correctly.
- An appropriate empty state appears when nothing matches.

### US-CATALOG-003 — Product Administration

As a MANAGER,
I want to create and maintain the product catalog,
so that establishments can order from current information.

**Acceptance Criteria:**
- Products can be created and edited.
- Categories can be managed.
- Products can be activated or deactivated.
- Historical confirmed orders retain their original information.

### US-CATALOG-004 — Availability Management

As a KITCHEN employee,
I want to change product availability,
so that establishments cannot request products currently unavailable for new orders.

**Acceptance Criteria:**
- KITCHEN can modify availability.
- KITCHEN cannot modify unrelated administrative product fields.
- Availability changes affect new order confirmation.
- Existing confirmed orders are not silently modified.

---

# Shopping Cart

### US-CART-001 — Build Cart

As a CUSTOMER,
I want to select products and quantities,
so that I can prepare my order.

**Acceptance Criteria:**
- Products can be added to the cart.
- Quantities can be increased or decreased.
- Invalid quantities are rejected.

### US-CART-002 — Edit Cart

As a CUSTOMER,
I want to modify or remove selected products,
so that I can correct my order before confirmation.

**Acceptance Criteria:**
- Selected quantities remain editable.
- Products can be removed.
- The entire cart can be cleared.
- These actions do not create confirmed orders.

### US-CART-003 — Review Cart

As a CUSTOMER,
I want to review my complete order before submitting it,
so that I can verify products and quantities.

**Acceptance Criteria:**
- The summary displays selected products and quantities.
- An empty cart cannot be submitted.
- The customer can return to editing before confirmation.

---

# Order Management

### US-ORDER-001 — Create Order

As a CUSTOMER,
I want to confirm my selected products, quantities, requested delivery date/time, and optional observations,
so that the bakery receives my order.

**Acceptance Criteria:**
- All required inputs are validated.
- Only authorized establishments can submit orders.
- Confirmed orders are stored with their associated items.
- A successful confirmation is shown.

### US-ORDER-002 — Atomic Order Creation

As the system,
I want order creation to be atomic,
so that incomplete or inconsistent orders cannot be stored.

**Acceptance Criteria:**
- Order, order items, and the initial audit event are created consistently.
- An operation failure does not leave a partially created order.
- Original requested product information is preserved.

### US-ORDER-003 — Prevent Duplicate Submission

As a CUSTOMER,
I want accidental repeated submissions to be handled safely,
so that one confirmation does not generate multiple identical orders.

**Acceptance Criteria:**
- Repeating the same submission with the same idempotency key does not create another order.
- A new intentional order can still be created.

### US-ORDER-004 — View Order History

As a CUSTOMER,
I want to consult my establishment's previous orders,
so that I can review what was requested and supplied.

**Acceptance Criteria:**
- Historical orders are accessible only to authorized users.
- Original quantities and final fulfillment information remain available.
- Cancelled orders remain in the historical record.

### US-ORDER-005 — Repeat Previous Order

As a CUSTOMER,
I want to reuse a previous order as a starting point,
so that recurring purchases require less effort.

**Acceptance Criteria:**
- Selecting Repeat Order creates a new editable cart.
- The previous order remains unchanged.
- Current availability is validated.
- Repeating an order never submits it automatically.

### US-ORDER-006 — Customer Cancellation

As a CUSTOMER,
I want to cancel an order before preparation begins,
so that I can correct a change in requirements.

**Acceptance Criteria:**
- Cancellation is permitted while the order is RECEIVED.
- Cancellation is rejected once preparation has started.
- The operation requires a reason.
- The order remains stored and auditable.

### US-ORDER-007 — Manager Cancellation

As a MANAGER,
I want to authorize an operational cancellation when necessary,
so that exceptional situations can be resolved.

**Acceptance Criteria:**
- Cancellation follows the permitted lifecycle rules.
- A reason and responsible user are recorded.
- The order is not physically deleted.
- Cancellation is visible in relevant interfaces.

---

# Production Management

### US-PROD-001 — Incoming Order Dashboard

As a KITCHEN employee,
I want to see incoming orders automatically,
so that I can organize production without manual WhatsApp forwarding.

**Acceptance Criteria:**
- New confirmed orders become visible without requiring manual page refresh.
- Orders display establishment, requested delivery time, and operational status.
- Existing orders remain accessible after reconnecting.

### US-PROD-002 — Filter Production Queue

As a KITCHEN employee,
I want to filter orders by status and identify requested delivery times,
so that I can organize pending work.

**Acceptance Criteria:**
- Operational status filters are available.
- Delivery time is visible.
- Order details are accessible.

### US-PROD-003 — Start Preparation

As a KITCHEN employee,
I want to mark a received order as IN_PROGRESS,
so that production status is communicated.

**Acceptance Criteria:**
- Only valid status transitions are accepted.
- The transition identifies the responsible employee.
- CUSTOMER and MANAGER can see the updated status.

### US-PROD-004 — Track Prepared Quantities

As a KITCHEN employee,
I want to register prepared quantities for each ordered product,
so that the system accurately reflects production progress.

**Acceptance Criteria:**
- Partial quantities are supported.
- Prepared quantities cannot exceed valid limits.
- Remaining quantities are displayed accurately.
- Changes are preserved and auditable.

### US-PROD-005 — Register Unavailable Quantities

As a KITCHEN employee,
I want to record quantities that cannot be supplied,
so that the order reflects actual production capacity.

**Acceptance Criteria:**
- Unavailable quantities can be recorded per item.
- A reason is mandatory.
- Original requested quantities remain unchanged.
- CUSTOMER and MANAGER can view the reduction.
- CUSTOMER approval is not required.

### US-PROD-006 — Complete Production

As a KITCHEN employee,
I want to mark an order READY when preparation is complete,
so that it can proceed to dispatch.

**Acceptance Criteria:**
- Every ordered quantity has been resolved as prepared or unavailable.
- At least one supplyable quantity must have been prepared.
- An order with unresolved quantities cannot become READY.
- A completely unavailable order cannot become READY.

### US-PROD-007 — Dispatch Order

As an authorized KITCHEN employee,
I want to mark a ready order as DISPATCHED,
so that the external establishment knows the order has left production.

**Acceptance Criteria:**
- Only READY orders can be dispatched.
- Dispatch requires an authorized KITCHEN user.
- The dispatch event is recorded.
- CUSTOMER and MANAGER see the updated status.

### US-PROD-008 — Control Catalog Availability

As a KITCHEN employee,
I want to mark products as available or unavailable,
so that new incoming orders reflect current production availability.

**Acceptance Criteria:**
- Availability can be updated independently of individual order fulfillment.
- Previously confirmed orders are preserved.
- Product administration permissions remain restricted.

### US-PROD-009 — Report Total Unavailability

As a KITCHEN employee,
I want to report when no products from an order can be supplied,
so that MANAGER can resolve the incident.

**Acceptance Criteria:**
- The situation is visible to MANAGER.
- The order cannot be marked READY or DISPATCHED normally.
- The incident and its reasons are preserved.

---

# Customer Order Tracking

### US-TRACK-001 — View Order Progress

As a CUSTOMER,
I want to consult the current status of my active orders,
so that I know how preparation is progressing.

**Acceptance Criteria:**
- The operational status is visible.
- Item-level progress is displayed.
- Information can be refreshed and synchronized.

### US-TRACK-002 — Receive Fulfillment Changes

As a CUSTOMER,
I want to see when requested quantities cannot be supplied,
so that I know what to expect upon delivery.

**Acceptance Criteria:**
- Unavailable quantities and reasons are visible.
- Changes remain accessible after reconnecting.
- No additional customer approval is required.
- The order can continue through its valid lifecycle.

### US-TRACK-003 — Confirm Receipt

As a CUSTOMER,
I want to confirm that my establishment has received a dispatched order,
so that its operational lifecycle can be completed.

**Acceptance Criteria:**
- Receipt confirmation is permitted only for DISPATCHED orders.
- Only a user authorized for the receiving establishment can confirm.
- The order becomes DELIVERED.
- Confirmation is timestamped and auditable.

---

# Management

### US-MGMT-001 — Operational Overview

As a MANAGER,
I want to view all bakery orders and their current states,
so that I can supervise daily operations.

**Acceptance Criteria:**
- Orders from all establishments are visible.
- Order counts by status are available.
- Current preparation information is displayed.

### US-MGMT-002 — Search and Filter Orders

As a MANAGER,
I want to filter orders by establishment, date, and status,
so that I can locate specific information quickly.

**Acceptance Criteria:**
- Filters return the corresponding orders.
- Individual order details are accessible.
- Empty results are handled appropriately.

### US-MGMT-003 — Monitor Incidents

As a MANAGER,
I want to identify partially fulfilled and completely unavailable orders,
so that I can respond to operational problems.

**Acceptance Criteria:**
- Fulfillment incidents are visible.
- Their reasons and affected quantities can be reviewed.
- Completely unavailable orders can be identified for intervention.

### US-MGMT-004 — Manage Establishments

As a MANAGER,
I want to register, update, and deactivate external establishments,
so that only authorized businesses participate in the ordering process.

**Acceptance Criteria:**
- Establishment information can be maintained.
- Deactivated establishments cannot create new orders.
- Historical orders remain available.
- Authorized user associations are preserved or revoked according to access rules.

### US-MGMT-005 — Review Operational History

As a MANAGER,
I want to consult an order's significant events,
so that I can understand its complete operational history.

**Acceptance Criteria:**
- Events identify the action, actor, and timestamp.
- Quantity reductions and status changes are traceable.
- Normal operational users cannot rewrite historical events.

---

# Security & Reliability

### US-SEC-001 — Server-Side Authorization

As the system,
I want every sensitive operation to validate the authenticated user's permissions,
so that client-side manipulation cannot bypass business restrictions.

**Acceptance Criteria:**
- CUSTOMER cannot access another establishment's private information.
- KITCHEN cannot execute MANAGER-only operations.
- Unauthorized RPC and database access attempts are rejected.
- Critical RLS policies are tested automatically.

### US-REL-001 — Consistent Operational State

As the system,
I want order operations to preserve valid data and state transitions,
so that concurrent users cannot create inconsistent results.

**Acceptance Criteria:**
- Critical updates enforce database constraints.
- Invalid or conflicting transitions are rejected.
- Errors are communicated without falsely reporting success.
- Significant successful operations generate the appropriate audit events.

---

## MVP Completion Scenario

The MVP must support the following end-to-end workflow:

1. CUSTOMER authenticates.
2. CUSTOMER browses the catalog and creates a cart.
3. CUSTOMER confirms an order.
4. KITCHEN and MANAGER receive the new order.
5. KITCHEN starts preparation.
6. KITCHEN records prepared quantities.
7. KITCHEN optionally records unavailable quantities and reasons.
8. CUSTOMER can view fulfillment changes without approving them.
9. KITCHEN completes all supplyable quantities.
10. KITCHEN marks the order READY.
11. An authorized KITCHEN employee dispatches the order.
12. CUSTOMER confirms physical receipt.
13. MANAGER can review the complete operational history.
14. CUSTOMER can repeat the historical order using a new editable cart.

Critical security, persistence, and lifecycle behavior must be covered by automated tests before public release.