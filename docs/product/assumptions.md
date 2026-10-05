# Product Assumptions & Constraints

**Project:** Bakery Orders
**Phase:** Sprint 0 — Product Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document records the known facts, product decisions, working assumptions, and unresolved questions that influence the Bakery Orders MVP.

The application is being developed from an initial real-world business observation without access to a complete operational requirements interview.

Development may proceed using documented assumptions. However, assumptions must never be silently represented as validated business requirements.

## 2. Classification

| Status | Meaning |
|---|---|
| CONFIRMED | Information obtained from the original business interaction. |
| DECIDED | Explicit product or functional decision accepted for the MVP. |
| ASSUMED | Reasonable working hypothesis requiring future validation. |
| OPEN | Unresolved decision that may affect implementation. |

---

## 3. Confirmed Business Context

### FACT-001 — Existing Ordering Channel

External commercial establishments currently submit orders to the bakery through WhatsApp.

**Status:** CONFIRMED

### FACT-002 — Manual Order Forwarding

The manager manually forwards incoming orders to a WhatsApp group containing employees involved in order preparation and dispatch.

**Status:** CONFIRMED

### FACT-003 — Multiple External Establishments

The bakery receives orders from several different commercial establishments rather than from a single customer.

**Status:** CONFIRMED

### FACT-004 — Estimated Order Volume

The expected initial volume is approximately 50 orders per day.

**Status:** ASSUMED — Planning estimate, not a measured business metric.

### FACT-005 — Current Message Structure

At least some existing WhatsApp orders appear to use a structured template.

It has not been confirmed whether every establishment follows the same format.

**Status:** PARTIALLY CONFIRMED

### FACT-006 — Existing Production Workflow

Orders are forwarded to an internal production group.

The exact internal preparation, packaging, dispatch, and delivery procedures have not been fully observed.

**Status:** PARTIALLY CONFIRMED

---

## 4. Accepted Product Decisions

### DEC-001 — Application Type

The MVP will be a single responsive web application with role-specific experiences.

No separate native applications will be developed.

**Status:** DECIDED

### DEC-002 — Customer Entry Point

External establishments will access the application through a link shared in the existing WhatsApp conversation.

The link itself does not grant unrestricted access. Authentication and authorization remain mandatory.

**Status:** DECIDED

### DEC-003 — Structured Ordering

Orders will be created through a product catalog and shopping cart instead of interpreting free-text WhatsApp messages.

**Status:** DECIDED

### DEC-004 — No Product Prices

Product prices, payments, and invoicing are excluded from the MVP.

**Status:** DECIDED

### DEC-005 — Production Visibility

Confirmed orders must become available to KITCHEN and MANAGER without manual forwarding.

**Status:** DECIDED

### DEC-006 — Partial Fulfillment

KITCHEN may register unavailable quantities without requesting CUSTOMER approval.

The original quantities must be preserved. Changes must remain visible to CUSTOMER and MANAGER.

Partial fulfillment must not block preparation or dispatch of the remaining supplyable products.

**Status:** DECIDED

### DEC-007 — Dispatch Responsibility

An authorized KITCHEN employee is responsible for marking a ready order as dispatched.

No courier role will exist in the MVP.

**Status:** DECIDED

### DEC-008 — Receipt Confirmation

CUSTOMER confirms physical receipt after the order has been dispatched.

**Status:** DECIDED

### DEC-009 — Cancellation

CUSTOMER can cancel an order while its status is RECEIVED.

Once preparation begins, cancellation requires MANAGER authorization.

Cancellation must preserve historical information.

**Status:** DECIDED

### DEC-010 — Total Unavailability

An order with no supplyable products cannot be marked READY.

The situation requires MANAGER intervention.

**Status:** DECIDED

### DEC-011 — In-App Updates

Order progress and fulfillment changes will be communicated through the application.

Automated WhatsApp messages, email, SMS, and native push notifications are excluded from V1.

**Status:** DECIDED

### DEC-012 — Technology & Budget

The initial architecture uses React, TypeScript, and Supabase.

Development will prioritize local infrastructure and free hosting tiers.

**Status:** DECIDED

---

## 5. Working Assumptions

The following assumptions are proposed for the first implementation.

They must be reviewed when operational feedback becomes available.

### ASM-001 — Single Bakery

The MVP serves one bakery with multiple external customers.

Multi-bakery administration is not required.

### ASM-002 — Shared Catalog

External establishments initially access the same active product catalog.

Business-specific catalogs and pricing are not required.

### ASM-003 — Product Classification

Products can be organized into categories such as:

- Bakery
- Pastry
- Sweet products
- Savory products

These are illustrative categories, not verified production data.

### ASM-004 — Product Units

Products may be ordered using different measurement or packaging units, such as:

- Unit
- Box
- Tray
- Kilogram

The final catalog will determine the exact supported units and quantity precision.

### ASM-005 — Manual Availability

KITCHEN or MANAGER controls product availability manually.

Availability is not calculated automatically from raw-material inventory or production capacity.

### ASM-006 — Internet Connectivity

CUSTOMER, KITCHEN, and MANAGER require an internet connection to perform operational actions.

Offline synchronization is not included in the MVP.

### ASM-007 — Customer Access

Each external establishment has at least one authorized user.

The data model should support multiple users associated with an establishment without requiring that functionality to be exposed in the initial customer interface.

### ASM-008 — Delivery Scheduling

CUSTOMER provides a requested delivery date and time.

Scheduling restrictions, cutoff times, holidays, and available delivery windows have not yet been defined.

### ASM-009 — Production Queue

KITCHEN operates through a shared order dashboard.

The MVP does not require separate production stations or department-specific queues.

### ASM-010 — Product Substitutions

The application will not automatically suggest or replace unavailable products with alternatives.

Unavailable quantities will be explicitly recorded.

### ASM-011 — Receipt Confirmation

If CUSTOMER does not confirm receipt, the order remains DISPATCHED until an authorized resolution is performed.

Automatic receipt confirmation based on elapsed time is excluded.

### ASM-012 — Demonstration Data

The first prototype will use fictional but realistic establishments, products, users, and orders.

Real commercial or personal data will not be introduced without an appropriate business purpose and authorization.

---

## 6. Open Questions

| ID | Question | Impact |
|---|---|---|
| OPEN-001 | What is the exact product catalog? | Catalog and product attributes |
| OPEN-002 | Which packaging units are actually used? | Quantity validation and product modeling |
| OPEN-003 | What delivery hours and cutoff rules apply? | Order scheduling |
| OPEN-004 | Which authentication method is most practical for external establishments? | Auth and onboarding UX |
| OPEN-005 | How many employees use the production interface simultaneously? | Realtime and interaction design |
| OPEN-006 | Does the bakery require internal notes hidden from external customers? | Permissions and order model |
| OPEN-007 | Are product variants required in V1? | Catalog and order-item structure |
| OPEN-008 | What operational resolution should apply after dispatch when delivery fails or is disputed? | Exceptional lifecycle |
| OPEN-009 | Does the bakery need dedicated packaging confirmation? | Production workflow |

These questions must not block the initial product demonstration unless a specific implementation directly depends on the missing information.

---

## 7. Risk Management

| Risk | Mitigation |
|---|---|
| Real workflows differ from assumptions. | Document assumptions and keep modules adaptable. |
| Product data is incomplete. | Use structured fictional seed data during development. |
| Authentication UX creates friction. | Separate access policies from the selected login interface. |
| Product packaging varies. | Avoid assuming every product uses integer quantities or individual units. |
| Availability changes during order creation. | Revalidate availability on submission. |
| Order statuses differ from actual bakery practices. | Isolate lifecycle rules and define explicit transitions. |
| Free infrastructure becomes insufficient. | Monitor provider limits and document operational costs. |

---

## 8. Assumption Validation Policy

When feedback from the bakery becomes available:

1. Identify the relevant assumption.
2. Record the newly verified information.
3. Evaluate its impact on product scope and domain rules.
4. Update affected documentation.
5. Create an ADR if an accepted architectural decision must change.
6. Update implementation and tests through a controlled development task.

Assumptions are not permanent architectural commitments.

**The purpose of this document is to enable development without confusing reasonable design hypotheses with verified business facts.**