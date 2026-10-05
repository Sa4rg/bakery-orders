# Order Lifecycle — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Domain Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document defines the operational lifecycle of a confirmed order in Bakery Orders.

It establishes:

- Supported order statuses.
- Valid state transitions.
- Actor permissions.
- Transition preconditions.
- Item-level fulfillment behavior.
- Partial and total unavailability.
- Cancellation and exceptional scenarios.
- Auditability and consistency requirements.

It complements:

- `docs/product/scope.md`
- `docs/product/user-stories.md`
- `docs/domain/business-rules.md`

Business rules identified in those documents remain applicable.

---

## 2. Lifecycle Overview

The normal order lifecycle follows this sequence:

```text
                  CUSTOMER
                     |
               Confirms order
                     |
                     v
                RECEIVED
                     |
                     | KITCHEN
                     | Start preparation
                     v
               IN_PROGRESS
                     |
                     | KITCHEN
                     | Resolve item quantities
                     v
                  READY
                     |
                     | Authorized KITCHEN
                     | Confirm dispatch
                     v
                DISPATCHED
                     |
                     | CUSTOMER
                     | Confirm receipt
                     v
                DELIVERED
```

Cancellation is an exceptional transition available under specific conditions.

Partial fulfillment does not introduce a separate operational status.

---

## 3. Operational States

### RECEIVED

The order has been successfully created and persisted.

Characteristics:

- It belongs to an authorized external establishment.
- It contains at least one valid item.
- The original requested quantities are preserved.
- It is visible to KITCHEN and MANAGER.
- Production has not started.

CUSTOMER may cancel the order at this stage.

### IN_PROGRESS

An authorized KITCHEN employee has started preparation.

During this stage, KITCHEN may:

- Record prepared quantities.
- Register unavailable quantities.
- Provide reasons for fulfillment reductions.
- Consult remaining unresolved quantities.
- Update global catalog availability independently.

CUSTOMER may monitor changes but cannot directly modify or cancel the order.

Managerial cancellation remains possible under the applicable rules.

### READY

Production has finished resolving every requested quantity.

An order may become READY only when:

1. Every order item has zero unresolved quantity.
2. At least one quantity has been successfully prepared.
3. The order is currently IN_PROGRESS.
4. The transition is performed by an authorized KITCHEN user.

A READY order may have COMPLETE or PARTIAL fulfillment.

Total unavailability never qualifies as READY.

### DISPATCHED

An authorized KITCHEN employee has confirmed that the ready order has left production for delivery.

Only READY orders can transition to DISPATCHED.

The operation must record the responsible user and timestamp.

No dedicated courier role exists in MVP V1.

### DELIVERED

The receiving establishment has confirmed physical receipt of the dispatched order.

Only an authorized CUSTOMER belonging to the order's establishment may perform this operation.

DELIVERED is a terminal state in the normal MVP lifecycle.

### CANCELLED

The order has been cancelled through an authorized operation.

Cancellation:

- Requires a reason.
- Preserves the original order.
- Preserves existing production information.
- Records the responsible actor and timestamp.
- Generates an audit event.

CANCELLED is terminal in the normal MVP lifecycle.

---

## 4. State Transition Matrix

| Current State | Target State | Authorized Actor | Required Conditions |
|---|---|---|---|
| New submission | RECEIVED | CUSTOMER / System | Valid authenticated submission; atomic creation |
| RECEIVED | IN_PROGRESS | KITCHEN | Valid order; preparation started |
| IN_PROGRESS | READY | KITCHEN | All quantities resolved; prepared total greater than zero |
| READY | DISPATCHED | Authorized KITCHEN | Order is ready |
| DISPATCHED | DELIVERED | Authorized CUSTOMER | Customer belongs to receiving establishment |
| RECEIVED | CANCELLED | CUSTOMER | Own establishment; mandatory reason |
| RECEIVED | CANCELLED | MANAGER | Authorized administrative cancellation; mandatory reason |
| IN_PROGRESS | CANCELLED | MANAGER | Authorized administrative cancellation; mandatory reason |
| READY | CANCELLED | MANAGER | Authorized administrative cancellation before dispatch; mandatory reason |

Any transition not explicitly permitted above must be rejected.

In particular:

- RECEIVED cannot transition directly to READY.
- RECEIVED cannot transition directly to DISPATCHED.
- IN_PROGRESS cannot transition directly to DELIVERED.
- DISPATCHED cannot transition back to production.
- DELIVERED and CANCELLED cannot return to an active state.

Post-dispatch cancellation, failed-delivery handling, and delivery disputes require a separately approved exceptional workflow and are not implemented in V1.

---

## 5. Order Item Fulfillment

Each order item preserves four relevant quantities.

| Quantity | Meaning |
|---|---|
| requestedQuantity | Original amount requested by CUSTOMER |
| preparedQuantity | Amount successfully prepared by KITCHEN |
| unavailableQuantity | Amount that KITCHEN has declared impossible to supply |
| remainingQuantity | Amount that has not yet been resolved |

The fundamental invariant is:

```text
requestedQuantity =
    preparedQuantity
  + unavailableQuantity
  + remainingQuantity
```

Therefore:

```text
remainingQuantity =
    requestedQuantity
  - preparedQuantity
  - unavailableQuantity
```

All quantities must be non-negative.

The system must prevent:

```text
preparedQuantity + unavailableQuantity
    > requestedQuantity
```

The original requested quantity must never be overwritten by fulfillment operations.

### Example

A business requests 30 croissants.

```text
Requested:      30
Prepared:       18
Unavailable:     7
Remaining:       5
```

Production is incomplete because five units remain unresolved.

Later, KITCHEN prepares the remaining five:

```text
Requested:      30
Prepared:       23
Unavailable:     7
Remaining:       0
```

The item is now fully resolved, although the original request has only been partially fulfilled.

---

## 6. Fulfillment Classification

Operational status and fulfillment condition are distinct concepts.

The fulfillment condition is derived from order-item quantities.

### Unresolved

One or more requested quantities still need a production outcome.

This is a progress condition, not a completed fulfillment classification.

### COMPLETE

All original requested quantities have been prepared.

Conditions:

```text
totalRemaining = 0
totalUnavailable = 0
totalPrepared = totalRequested
```

### PARTIAL

All quantities have been resolved, but some could not be supplied.

Conditions:

```text
totalRemaining = 0
totalPrepared > 0
totalUnavailable > 0
```

### UNAVAILABLE

All requested quantities have been resolved as unavailable.

Conditions:

```text
totalRemaining = 0
totalPrepared = 0
totalUnavailable = totalRequested
```

An UNAVAILABLE order cannot transition to READY.

It requires MANAGER intervention.

The fulfillment condition may be computed from persisted item quantities; storing a separate database status is not mandatory unless justified during technical design.

During production, the interface may still highlight existing shortages before the final fulfillment condition has been determined.

---

## 7. Partial Fulfillment Workflow

Partial fulfillment is an accepted business operation.

Example:

```text
Original request:
30 croissants

Production outcome:
20 prepared
10 unavailable
```

The workflow is:

1. KITCHEN opens the IN_PROGRESS order.
2. KITCHEN records the unavailable quantity.
3. KITCHEN provides a mandatory reason.
4. The system validates the quantity operation.
5. The unavailable quantity is persisted.
6. A corresponding audit event is generated.
7. CUSTOMER can immediately visualize the updated order.
8. MANAGER can visualize the reduction and its reason.
9. KITCHEN continues preparing the remaining supplyable products.

CUSTOMER approval is not required.

The order must not enter a waiting-for-customer-approval state.

Partial fulfillment must not block READY or DISPATCHED once all remaining quantities have been resolved and at least one quantity has been prepared.

### Global Availability vs. Order Fulfillment

Changing the global availability of a product affects eligibility for newly confirmed orders.

It must not automatically change quantities in existing confirmed orders.

Existing orders require explicit fulfillment operations.

---

## 8. Total Unavailability Workflow

Total unavailability occurs when:

```text
totalRemaining = 0
totalPrepared = 0
totalUnavailable = totalRequested
```

Expected behavior:

1. The system identifies that no requested quantity can be supplied.
2. The situation becomes visible to MANAGER.
3. The order remains blocked from normal READY and DISPATCHED transitions.
4. CUSTOMER can consult the recorded unavailability and its reasons.
5. MANAGER resolves the situation through an authorized operation.

For MVP V1, managerial cancellation is the defined resolution path when the complete order cannot be supplied.

A more advanced replacement, rescheduling, or renegotiation workflow is outside the initial scope.

Cancellation preserves all original quantities and previous production events.

---

## 9. Cancellation Policy

### Customer Cancellation

CUSTOMER can cancel an order only when its current status is RECEIVED.

The CUSTOMER must belong to the establishment that owns the order.

A reason is mandatory.

### Manager Cancellation

MANAGER may cancel an order before dispatch, including after preparation has started.

The cancellation must be explicit, justified, and audited.

### Restrictions

Neither CUSTOMER nor KITCHEN may bypass cancellation permissions by directly changing database fields.

Cancellation must preserve:

- Order identity.
- Original request.
- Recorded production information.
- Cancellation reason.
- Responsible actor.
- Cancellation timestamp.
- Historical events.

Normal application behavior must never physically delete an order to represent cancellation.

---

## 10. Receipt Confirmation

Receipt confirmation is exclusively a CUSTOMER operation in the standard MVP lifecycle.

Preconditions:

- The order is DISPATCHED.
- The authenticated user belongs to the receiving establishment.
- The order has not already reached a terminal state.

Successful confirmation:

- Changes status to DELIVERED.
- Persists the confirmation timestamp.
- Records the responsible actor.
- Generates an audit event.
- Becomes visible to KITCHEN and MANAGER.

Automatic receipt confirmation based on elapsed time is excluded from V1.

---

## 11. Audit Events

The lifecycle must preserve significant operational events.

Suggested event types:

| Event | Description |
|---|---|
| ORDER_CREATED | Order successfully confirmed |
| PREPARATION_STARTED | Production started |
| QUANTITY_PREPARED | Prepared quantity recorded |
| QUANTITY_UNAVAILABLE | Unavailable quantity recorded with reason |
| ORDER_READY | Production completed |
| ORDER_DISPATCHED | Dispatch confirmed |
| ORDER_DELIVERED | Customer receipt confirmed |
| ORDER_CANCELLED | Authorized cancellation |

Event names are conceptual identifiers and may be refined during technical design.

Each event must preserve:

- Affected order.
- Responsible actor.
- Event type.
- Timestamp.
- Relevant operation details.
- Previous and new values, where applicable.

Audit records must be created by trusted backend operations.

---

## 12. Consistency & Concurrency

Order operations must preserve business invariants even when multiple employees access the same order simultaneously.

Examples:

- Two employees cannot both complete the same remaining quantity if doing so would exceed the requested amount.
- An order cannot become READY while another operation leaves unresolved quantities.
- Concurrent cancellation and preparation-start requests must produce one valid final result.
- Duplicate lifecycle requests must not create inconsistent states.

Critical transitions and quantity operations must be implemented transactionally.

Frontend controls may prevent obvious mistakes, but database/backend validation remains authoritative.

Realtime updates communicate successful persisted changes. They are not the source of truth.

---

## 13. Open Lifecycle Questions

The following workflows require separate decisions before implementation:

- Correction of incorrectly registered prepared or unavailable quantities.
- Failed delivery or customer-reported discrepancy after DISPATCHED.
- Exceptional changes to an already READY order.
- Detailed scheduling restrictions and cutoff times.
- Whether additional internal packaging confirmation is required.

No implementation agent may invent these workflows without documenting the decision.

---

## 14. Related Business Rules

The lifecycle primarily implements:

- BR-ORDER-005 through BR-ORDER-014
- BR-PROD-001 through BR-PROD-009
- BR-LIFE-001 through BR-LIFE-008
- BR-TRACK-001 through BR-TRACK-006
- BR-AUDIT-001 through BR-AUDIT-007

Any modification to the lifecycle must be reflected in the corresponding business rules and automated tests.