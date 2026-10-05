# MVP Scope — Bakery Orders

**Project:** Bakery Orders (working name)
**Document Status:** Draft — Pending Approval
**Phase:** Sprint 0 — Product Definition
**Version:** 1.0

---

## 1. Purpose

This document defines the functional boundaries of the Bakery Orders Minimum Viable Product (MVP).

Its purpose is to establish a clear development contract, prevent uncontrolled scope expansion, and ensure all implemented features contribute directly to the product vision.

The MVP focuses on digitizing the complete B2B order lifecycle: order creation, production, fulfillment tracking, dispatch, and customer receipt confirmation.

This is a single-bakery application serving multiple external businesses. It is not intended to operate as a multi-bakery SaaS platform in its first version.

---

## 2. MVP Actors

The application supports three primary roles.

| Role | Description |
|---|---|
| CUSTOMER | Authorized external establishment that places and receives orders. |
| KITCHEN | Authorized bakery employee responsible for production and operational fulfillment. |
| MANAGER | Administrative user responsible for business oversight, catalog management, establishments, and operational incidents. |

Each role has its own authorized interface and operations.

Authentication and authorization are mandatory. Public, unrestricted access to operational or customer information is not permitted.

The specific authentication experience will be established during technical architecture definition.

---

## 3. Functional Scope

### 3.1 Identity & Access

**Module ID:** AUTH

The MVP must support:

- User authentication and session management.
- Role-based access control (CUSTOMER, KITCHEN, MANAGER).
- Protected application routes.
- User association with authorized establishments where applicable.
- Prevention of cross-business data access.
- Secure logout and session recovery.
- Controlled onboarding of authorized users.

A CUSTOMER must never access orders or private information belonging to another establishment unless explicitly authorized.

KITCHEN and MANAGER permissions must be differentiated.

The exact onboarding and authentication mechanisms remain architectural decisions.

### 3.2 Product Catalog

**Module ID:** CATALOG

The application must provide a structured product catalog.

Customer capabilities:

- Browse available products.
- Search products by name.
- Filter products by category.
- View product name, description, image (when available), and unit of measurement.
- Identify unavailable products.
- Select products for an order.

No product prices will be displayed in the MVP.

Catalog administration:

MANAGER can:

- Create and edit products.
- Create and edit categories.
- Activate or deactivate products.
- Modify product availability.

KITCHEN can:

- View catalog availability.
- Mark products as available or unavailable.

KITCHEN cannot modify unrelated administrative product information.

Product deactivation or availability changes must not silently alter previously confirmed orders.

Unavailable products cannot be added to new confirmed orders.

Product availability must be revalidated when an order is submitted.

### 3.3 Shopping Cart

**Module ID:** CART

CUSTOMER can:

- Add products to a cart.
- Increase or decrease quantities.
- Remove products.
- Review selected products and quantities.
- Clear the cart.
- Continue browsing before confirmation.

Cart information must remain editable until order confirmation.

The system must prevent invalid quantities and submission of empty orders.

The cart is not considered a confirmed order and must not appear in production.

### 3.4 Order Creation

**Module ID:** ORDERING

CUSTOMER can create an order containing:

- One or more products.
- Requested quantity for each product.
- Product unit of measurement.
- Requested delivery date and time.
- Optional observations.

Before submitting, CUSTOMER must be able to review the complete order summary.

Upon confirmation, the system must:

1. Validate the authenticated customer and business association.
2. Revalidate product availability and submitted quantities.
3. Prevent unintended duplicate submissions.
4. Create the order and its corresponding items atomically.
5. Preserve the original requested information.
6. Generate an initial audit event.
7. Make the order available to KITCHEN and MANAGER.
8. Display a successful confirmation to CUSTOMER.

Order creation must not rely on manual WhatsApp forwarding.

### 3.5 Production Management

**Module ID:** PRODUCTION

KITCHEN must have access to an operational dashboard containing incoming and active orders.

The interface must support:

- Real-time order visibility.
- Filtering orders by operational status.
- Sorting or identifying orders by requested delivery time.
- Viewing order details.
- Starting order preparation.
- Recording prepared quantities per order item.
- Recording unavailable quantities.
- Providing a mandatory reason when requested quantities cannot be supplied.
- Viewing remaining quantities.
- Marking an order as ready when permitted.
- Marking a ready order as dispatched.
- Consulting completed orders.

Preparation tracking must support partial quantities rather than relying exclusively on binary completed/not-completed states.

#### Partial Fulfillment

KITCHEN may reduce the quantities that can be supplied without requesting CUSTOMER approval.

The application must preserve:

- Original requested quantity.
- Prepared quantity.
- Unavailable quantity.
- Remaining unresolved quantity.

A reduction must:

- Require a reason.
- Be reflected in the affected order.
- Be communicated to CUSTOMER through the application.
- Be visible to MANAGER.
- Generate an audit event.
- Not block continued preparation or dispatch of the remaining supplied products.

If no requested products can be supplied, the order cannot be marked READY.

Such cases require managerial intervention and appropriate resolution.

### 3.6 Order Lifecycle

**Module ID:** LIFECYCLE

The primary operational states are:

| Status | Description |
|---|---|
| RECEIVED | Order successfully created and awaiting preparation. |
| IN_PROGRESS | Production has started. |
| READY | Production of all quantities that can be supplied is complete. |
| DISPATCHED | An authorized KITCHEN employee has confirmed the order has left production for delivery. |
| DELIVERED | CUSTOMER has confirmed physical receipt. |
| CANCELLED | Order was cancelled through an authorized operation. |

A separate fulfillment condition must allow the system to distinguish fully supplied and partially supplied orders.

Partial fulfillment is not an additional operational lifecycle status.

Only valid status transitions must be permitted.

#### Cancellation

CUSTOMER may cancel an order while its status is RECEIVED.

Once preparation begins, cancellation requires MANAGER authorization.

Cancelled orders must remain stored for historical and auditing purposes.

A cancellation reason, responsible actor, and timestamp must be recorded.

#### Dispatch and Receipt

An authorized KITCHEN employee is responsible for marking an order DISPATCHED.

No dedicated courier role will be introduced in the MVP.

CUSTOMER is responsible for confirming physical receipt.

An order cannot be marked DELIVERED before being DISPATCHED.

### 3.7 Customer Order Tracking

**Module ID:** TRACKING

CUSTOMER must be able to:

- Consult active orders.
- View the current operational status.
- View preparation progress.
- Identify unavailable quantities.
- Consult fulfillment changes and their communicated reasons.
- View completed orders.
- Confirm receipt of dispatched orders.

Order changes must be synchronized with the customer interface.

In-app updates are part of the MVP. External WhatsApp, SMS, email, or native push notifications are not required.

Important order information must remain available when CUSTOMER returns to the application, even if they were disconnected when an event occurred.

### 3.8 Order History & Reordering

**Module ID:** HISTORY

CUSTOMER must have access to their establishment's previous orders.

The history must support:

- Listing previous orders.
- Viewing order details.
- Viewing order dates and final operational status.
- Selecting a previous order as the basis for a new order.

The Repeat Order functionality must generate a new editable cart.

It must not automatically submit the historical order.

Product availability must be checked again before confirmation. Historical products that are no longer available must be identified appropriately.

Original historical order information must remain unchanged.

### 3.9 Management Dashboard

**Module ID:** MANAGEMENT

MANAGER must have an operational overview of the bakery.

The MVP dashboard must support:

- Viewing all orders.
- Viewing order counts grouped by operational status.
- Filtering by date, establishment, and status.
- Searching for specific orders.
- Consulting order details and production progress.
- Identifying partially fulfilled orders.
- Viewing operational incidents.
- Consulting historical orders.
- Performing authorized administrative cancellations.
- Accessing catalog and establishment management.

MANAGER must be able to supervise operations without requiring direct access to the KITCHEN account.

Advanced financial or analytical dashboards are excluded from the MVP.

### 3.10 Establishment Management

**Module ID:** BUSINESSES

MANAGER must be able to:

- Register external establishments.
- View registered establishments.
- Edit establishment information.
- Activate or deactivate establishments.
- Associate authorized users with establishments through the defined access-management mechanism.
- Consult orders associated with an establishment.

Deactivating an establishment must not delete its historical orders.

### 3.11 Auditability

**Module ID:** AUDIT

The system must preserve an operational history of significant order events.

At minimum, auditability must cover:

- Order creation.
- Order cancellation.
- Preparation start.
- Quantity preparation updates.
- Unavailable quantity registration.
- Order status transitions.
- Dispatch confirmation.
- Customer receipt confirmation.

Audit records must include the event, responsible actor, affected order, and timestamp.

Where relevant, previous and new values must be preserved.

Audit data must not be freely editable by CUSTOMER or KITCHEN.

---

## 4. Non-Functional Requirements

The MVP must satisfy the following quality attributes.

### 4.1 Security

- Security by design.
- OWASP Top 10:2025 as the primary risk-awareness reference.
- OWASP ASVS as a complementary verification reference.
- Database authorization through PostgreSQL Row Level Security.
- Server-side enforcement of critical business rules.
- No privileged secrets exposed in the browser.
- Mandatory security review before public release.

### 4.2 Reliability & Data Integrity

- Atomic order creation.
- Idempotent order submission.
- Database constraints for critical data invariants.
- Controlled lifecycle transitions.
- Error handling without silent failures.
- Preservation of historical order information.

### 4.3 Maintainability

- TypeScript.
- Feature-based modular architecture.
- SOLID principles, emphasizing Single Responsibility.
- Clear separation between UI, application, domain, and data-access concerns.
- Incremental implementation.
- Versioned database migrations.
- Documented architectural decisions.

### 4.4 Testing

The project follows TDD for new business behavior.

The testing strategy includes:

- Vitest for unit testing.
- React Testing Library for component testing.
- Integration testing against local Supabase.
- pgTAP for PostgreSQL functions, constraints, permissions, and RLS.
- Playwright for critical end-to-end workflows.

Critical authorization and business rules must have automated verification.

### 4.5 Usability

- Responsive application.
- Mobile-first CUSTOMER experience.
- Operational interfaces suitable for kitchen and management devices.
- Clear status indicators.
- Accessible and understandable feedback.
- Explicit loading, empty, success, and error states.

### 4.6 Infrastructure & Cost

The MVP will prioritize free development infrastructure.

Initial architecture:

- React + TypeScript + Vite.
- Supabase (PostgreSQL, Auth, RLS, RPC, Realtime, Storage).
- Supabase local development environment.
- Free-tier frontend hosting.

The initial development infrastructure target is $0/month, subject to provider limitations.

---

## 5. Explicitly Out of Scope

The following features are intentionally excluded from MVP V1:

| Feature | Scope |
|---|---|
| Online payments | Excluded |
| Product pricing | Excluded |
| Invoicing | Excluded |
| Complete inventory management | Excluded |
| Raw material management | Excluded |
| Supplier management | Excluded |
| Delivery route optimization | Excluded |
| Courier accounts | Excluded |
| Native mobile applications | Excluded |
| Automated WhatsApp integration | Excluded |
| SMS and email notifications | Excluded |
| AI-powered order interpretation | Excluded |
| Advanced financial analytics | Excluded |
| Multi-bakery SaaS capabilities | Excluded |
| Offline order creation and synchronization | Excluded |
| Public customer self-registration | Excluded |

These exclusions protect the MVP from unnecessary complexity.

Future inclusion requires an explicit scope decision.

---

## 6. MVP Acceptance Criteria

The MVP is functionally complete when the following end-to-end scenario can be executed successfully:

1. An authorized external establishment accesses the application.
2. The establishment browses the catalog and creates an order.
3. The order is successfully validated and stored.
4. KITCHEN and MANAGER receive visibility of the new order.
5. KITCHEN starts production.
6. KITCHEN records prepared quantities.
7. If necessary, KITCHEN records unavailable quantities and provides a reason.
8. CUSTOMER can visualize those fulfillment changes without providing additional approval.
9. KITCHEN completes preparation of the supplied quantities.
10. An authorized KITCHEN employee marks the order as dispatched.
11. CUSTOMER confirms physical receipt.
12. The complete order remains available in its historical record.
13. CUSTOMER can use the previous order to populate a new editable cart.
14. MANAGER can review the complete lifecycle and its associated audit events.

Security, authorization, data integrity, and critical automated tests must also pass before the MVP is considered ready for public release.

---

## 7. Assumptions & Pending Validation

The following aspects require validation with the real business when possible:

- Exact product catalog and category structure.
- Product measurement units and packaging conventions.
- Establishment onboarding preferences.
- Customer authentication experience.
- Operational cutoff times for order placement.
- Requested delivery scheduling constraints.
- Number and type of devices used in production.
- Whether additional internal order notes are necessary.

These assumptions must be documented separately in `docs/product/assumptions.md`.

They must not be silently treated as confirmed business requirements.

---

## 8. Scope Control

Any new functionality not included in this document must be evaluated before implementation.

A scope change must identify:

- Business justification.
- Affected modules.
- Data model impact.
- Security implications.
- Testing requirements.
- Estimated implementation effort.

Changes affecting accepted architectural decisions must also be reflected in the relevant ADR.

**The objective of the MVP is to deliver a complete, reliable operational workflow—not to implement every possible feature of a commercial bakery management platform.**