# Domain Model — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Domain Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document defines the initial conceptual domain model for the Bakery Orders MVP.

It describes:

- Core business entities.
- Entity responsibilities.
- Relationships and ownership.
- Important attributes.
- Business invariants.
- Aggregate boundaries.
- Domain concepts and value objects.
- Future extensibility considerations.

This document is technology-independent where practical.

It is not the final PostgreSQL schema.

Exact table definitions, indexes, constraints, RLS policies, and SQL migrations will be specified in `docs/architecture/data-model.md`.

---

## 2. Domain Overview

Bakery Orders is a single-bakery B2B order management application.

The system supports multiple external establishments ordering products from one bakery.

The principal domain areas are:

| Domain Area | Responsibility |
|---|---|
| Identity & Access | Users, roles, authorization, and establishment memberships |
| Catalog | Products, categories, measurement units, and availability |
| Ordering | Confirmed orders, historical requests, and cancellations |
| Production | Preparation progress, shortages, and fulfillment |
| Management | Operational oversight and administration |
| Auditability | Preservation of significant business events |

These are logical boundaries within one application, not independent microservices.

---

## 3. Entity Overview

| Entity | Domain Area | Description |
|---|---|---|
| Profile | Identity & Access | Application information associated with an authenticated user |
| Business | Identity & Access | External establishment that places orders |
| BusinessMembership | Identity & Access | Authorization relationship between a user and a business |
| Category | Catalog | Product classification |
| Product | Catalog | Product available for ordering |
| Order | Ordering | Confirmed request made by an external establishment |
| OrderItem | Ordering / Production | Product line and its fulfillment progress |
| OrderEvent | Auditability | Historical record of a significant order operation |

The first version should not introduce additional persistent entities without a defined domain responsibility.

---

# 4. Identity & Access

## 4.1 Profile

**Entity ID:** ENT-PROFILE

Represents the application's information about an authenticated user.

Authentication credentials and session management are delegated to Supabase Auth.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Identifier linked to the authenticated user |
| displayName | User's display name |
| role | CUSTOMER, KITCHEN, or MANAGER |
| active | Application-level access status |
| createdAt | Creation timestamp |
| updatedAt | Last update timestamp |

### Business Rules

- A Profile must correspond to a valid authenticated identity.
- Application roles must be assigned through a trusted process.
- Users must not be allowed to elevate their own privileges.
- An inactive Profile cannot perform protected business operations.
- CUSTOMER access to establishments is determined through valid membership relationships.

The initial model assumes one primary application role per user.

More complex multi-role permissions are outside MVP V1.

### Security Considerations

Passwords, authentication tokens, and credential hashes must not be duplicated in this entity.

They remain the responsibility of the authentication provider.

---

## 4.2 Business

**Entity ID:** ENT-BUSINESS

Represents an external commercial establishment that purchases products from the bakery.

Examples:

- Café Central.
- Hotel Ribeira.
- Restaurant Avenida.

These names are fictional examples.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Unique business identifier |
| name | Establishment name |
| contactName | Optional operational contact |
| contactPhone | Optional contact number |
| notes | Optional administrative observations |
| active | Whether the establishment is enabled |
| createdAt | Creation timestamp |
| updatedAt | Last update timestamp |

Additional personal or commercial information should only be collected when justified by an actual product requirement.

### Business Rules

- An active Business may create orders through authorized CUSTOMER users.
- An inactive Business cannot create new orders.
- Deactivation must not remove historical orders.
- Only MANAGER can administratively maintain Business records.

### Relationships

One Business may have:

- Multiple authorized users.
- Multiple orders.

---

## 4.3 BusinessMembership

**Entity ID:** ENT-BUSINESS-MEMBERSHIP

Represents an authorized relationship between a Profile and a Business.

This entity prevents us from assuming that each establishment can only have one account.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Membership identifier |
| userId | Associated Profile |
| businessId | Associated Business |
| active | Membership authorization status |
| createdAt | Association timestamp |

### Business Rules

- Membership must reference an existing Profile and Business.
- Duplicate active associations between the same user and establishment are not permitted.
- CUSTOMER operations require an active and authorized membership.
- Establishment ownership must not be trusted solely from client-submitted data.

The MVP interface may initially expose only one establishment context per CUSTOMER.

The underlying model should remain compatible with multiple authorized users per establishment.

---

# 5. Catalog

## 5.1 Category

**Entity ID:** ENT-CATEGORY

Represents a logical grouping of bakery products.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Unique category identifier |
| name | Display name |
| description | Optional description |
| active | Administrative activation status |
| displayOrder | Optional ordering position |
| createdAt | Creation timestamp |
| updatedAt | Last update timestamp |

### Business Rules

- A category may contain multiple products.
- Category administration is restricted to MANAGER.
- Removing or deactivating a category must not damage historical order information.

---

## 5.2 Product

**Entity ID:** ENT-PRODUCT

Represents a catalog item that an establishment may request.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Unique product identifier |
| categoryId | Associated category |
| name | Product name |
| description | Optional product description |
| unit | Measurement or packaging unit |
| quantityStep | Allowed quantity increment, subject to catalog rules |
| imagePath | Optional image reference |
| active | Administrative activation status |
| available | Current operational availability |
| createdAt | Creation timestamp |
| updatedAt | Last update timestamp |

### Measurement Examples

Possible product units include:

- UNIT
- BOX
- TRAY
- KG

These values are preliminary and must be validated against the real catalog.

Quantity validation must account for product-specific measurement conventions.

For example, kilograms may require decimal precision, while individually sold products may require whole numbers.

### Business Rules

- Product must belong to a valid category.
- Only active and available products may enter newly confirmed orders.
- KITCHEN and MANAGER may modify product availability.
- MANAGER maintains administrative product information.
- Product availability changes must not alter existing confirmed orders.
- Products referenced by historical orders must not be physically deleted through ordinary administrative actions.

### Product Prices

Product prices are excluded from MVP V1.

No pricing calculations are required for order creation.

---

# 6. Ordering

## 6.1 Order — Aggregate Root

**Entity ID:** ENT-ORDER

Order represents a confirmed request submitted by an authorized external establishment.

Order is the principal aggregate root of the transactional domain.

It governs the consistency of its associated order items and lifecycle operations.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Unique order identifier |
| businessId | Establishment that owns the order |
| createdByUserId | User who submitted the order |
| status | Current operational lifecycle state |
| requestedDeliveryAt | Requested delivery date and time |
| customerNotes | Optional customer observations |
| submissionKey | Idempotency identifier for creation |
| createdAt | Creation timestamp |
| updatedAt | Last modification timestamp |
| cancelledAt | Cancellation timestamp, when applicable |
| cancelledByUserId | Responsible actor, when applicable |
| cancellationReason | Required for cancelled orders |

A human-readable order number may be introduced as an additional presentation identifier.

Its exact generation strategy will be decided during database design.

### Supported Statuses

- RECEIVED
- IN_PROGRESS
- READY
- DISPATCHED
- DELIVERED
- CANCELLED

### Business Rules

- Every Order belongs to one Business.
- Every Order has at least one OrderItem.
- Creation must be atomic.
- Its original submitted information must be preserved.
- Status transitions must follow `order-lifecycle.md`.
- Cancellation must never physically delete the order.
- Sensitive operations must validate the authenticated actor.
- Duplicate submission must be prevented through a trusted idempotency mechanism.

### Aggregate Responsibilities

The Order aggregate coordinates:

- Creation.
- Lifecycle transitions.
- Preparation completion eligibility.
- Cancellation.
- Item-level quantity invariants.
- Final fulfillment classification.

Aggregate consistency must be maintained through trusted transactional operations.

---

## 6.2 OrderItem

**Entity ID:** ENT-ORDER-ITEM

Represents a single product line in a confirmed Order.

OrderItem is part of the Order aggregate.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Unique item identifier |
| orderId | Parent Order |
| productId | Original catalog Product |
| productNameSnapshot | Product name at order creation |
| unitSnapshot | Measurement unit at order creation |
| requestedQuantity | Original customer request |
| preparedQuantity | Successfully prepared amount |
| unavailableQuantity | Amount that cannot be supplied |
| createdAt | Creation timestamp |
| updatedAt | Last fulfillment update |

### Derived Attribute

```text
remainingQuantity =
    requestedQuantity
  - preparedQuantity
  - unavailableQuantity
```

This value may be calculated rather than independently stored.

### Invariants

```text
requestedQuantity > 0

preparedQuantity >= 0

unavailableQuantity >= 0

preparedQuantity + unavailableQuantity
    <= requestedQuantity
```

Quantity values must use an exact numeric representation appropriate for the product's unit and precision.

### Historical Preservation

OrderItem preserves a product snapshot.

This prevents later catalog modifications from changing the historical meaning of a confirmed order.

For example:

```text
Original product:
Croissant Traditional

Original requested quantity:
30 UNIT
```

Those values must remain historically correct even if the catalog product is subsequently renamed or deactivated.

### Production Responsibility

KITCHEN may update preparation and unavailable quantities only through authorized operations.

Every significant change must be audited.

Quantity corrections require a separately defined controlled workflow.

---

# 7. Auditability

## 7.1 OrderEvent

**Entity ID:** ENT-ORDER-EVENT

Represents an immutable historical record of a significant operation affecting an Order.

### Conceptual Attributes

| Attribute | Description |
|---|---|
| id | Unique event identifier |
| orderId | Affected Order |
| orderItemId | Optional affected OrderItem |
| actorUserId | Responsible user, when applicable |
| eventType | Type of operation |
| previousValue | Relevant previous information |
| newValue | Relevant resulting information |
| reason | Optional or mandatory depending on the event |
| metadata | Additional structured event context |
| occurredAt | Trusted event timestamp |

### Example Events

- ORDER_CREATED
- PREPARATION_STARTED
- QUANTITY_PREPARED
- QUANTITY_UNAVAILABLE
- ORDER_READY
- ORDER_DISPATCHED
- ORDER_DELIVERED
- ORDER_CANCELLED

### Business Rules

- Audit events must be created by trusted backend operations.
- Clients must not supply arbitrary actor identities or trusted timestamps.
- Events must not be freely editable or deletable by operational users.
- Order cancellation must preserve all previous events.
- Sensitive credentials must never be stored inside audit metadata.

OrderEvent is an audit record, not a substitute for the current persisted state of Order or OrderItem.

---

# 8. Important Domain Concepts

The following concepts may be represented as value objects, types, or derived calculations.

Their implementation form will be chosen pragmatically.

## 8.1 Quantity

Represents an exact amount associated with a valid measurement or packaging unit.

Quantity must respect the product's allowed precision.

## 8.2 OrderStatus

Represents the current operational lifecycle stage.

Only approved transitions are valid.

## 8.3 FulfillmentProgress

Represents the current preparation outcome based on OrderItem quantities.

Relevant totals include:

```text
totalRequested
totalPrepared
totalUnavailable
totalRemaining
```

## 8.4 FulfillmentCondition

Represents the final fulfillment outcome once all quantities have been resolved:

- COMPLETE
- PARTIAL
- UNAVAILABLE

While unresolved quantities exist, the order is still undergoing fulfillment.

FulfillmentCondition should preferably be derived from persisted quantities unless a justified persistence requirement emerges.

## 8.5 ProductAvailability

Represents whether a product is currently eligible for new confirmed orders.

ProductAvailability must remain independent of historical OrderItem fulfillment.

## 8.6 DeliveryRequest

Represents the requested delivery date and time provided during order creation.

Specific cutoff and scheduling rules remain pending business validation.

---

# 9. Conceptual Relationships

```text
Profile
   |
   | 1
   |
   | N
BusinessMembership
   |
   | N
   |
   | 1
Business
   |
   | 1
   |
   | N
 Order
   |
   | 1
   |----------------------|
   | N                    | N
OrderItem              OrderEvent
   |
   | N
   |
   | 1
Product
   |
   | N
   |
   | 1
Category
```

Additionally:

- Profile is linked to the authentication provider.
- Order references the Profile responsible for its creation.
- OrderEvent references its responsible actor when applicable.
- BusinessMembership authorizes access to Business information.

The final relational model will be documented separately.

---

# 10. Aggregate Boundaries

## Order Aggregate

Order is the primary transactional aggregate.

Its consistency boundary includes:

- Order lifecycle state.
- OrderItem quantities.
- Fulfillment validation.
- Cancellation restrictions.

Operations affecting these invariants must be handled transactionally.

Related OrderEvent records must be persisted consistently with their corresponding successful operations.

## Catalog

Product and Category belong to the Catalog domain.

Global availability changes do not automatically mutate existing Order aggregates.

## Identity & Access

BusinessMembership controls establishment authorization.

A client-provided business identifier is not sufficient proof of access.

---

# 11. Operational Incidents

An operational incident is a relevant production situation requiring visibility or managerial attention.

Examples:

- Partial product unavailability.
- Total order unavailability.
- Administrative cancellation.

For MVP V1, quantity shortages and their reasons can be represented through:

- Current OrderItem fulfillment values.
- Persisted OrderEvent records.
- Derived management dashboard indicators.

A separate persistent `OrderIncident` entity is not mandatory for the initial model.

It should only be introduced when a distinct incident workflow requires independent ownership, assignment, resolution states, or additional lifecycle behavior.

Total unavailability must still be clearly identifiable and require MANAGER intervention.

---

# 12. Customer Notifications

Relevant production information must remain available even when CUSTOMER is disconnected.

The current Order and its historical events are the source of truth.

Supabase Realtime will provide synchronization while authorized interfaces are connected.

A separate persistent notification entity is not required solely to display the current order state and fulfillment changes.

If future requirements introduce notification acknowledgements, unread counters, or delivery guarantees across external channels, the notification model must be reconsidered.

---

# 13. Cart Modeling

The shopping cart is an editable pre-confirmation concept.

For MVP V1, it may be managed through application state without requiring a dedicated persistent database aggregate.

The cart becomes a confirmed Order only after a successful validated submission.

Cart persistence across devices is not an accepted MVP requirement.

Repeat Order creates a new cart from historical information and must revalidate current catalog availability.

---

# 14. Role Responsibility Matrix

| Operation | CUSTOMER | KITCHEN | MANAGER |
|---|:---:|:---:|:---:|
| Browse catalog | Yes | Yes | Yes |
| Create own establishment order | Yes | No | No |
| View own establishment orders | Yes | — | — |
| View production orders | No | Yes | Yes |
| Start production | No | Yes | No |
| Update prepared quantities | No | Yes | No |
| Register unavailable quantities | No | Yes | No |
| Change product availability | No | Yes | Yes |
| Manage catalog information | No | No | Yes |
| Dispatch READY order | No | Yes | No |
| Confirm own establishment receipt | Yes | No | No |
| Cancel RECEIVED order | Own orders | No | Yes |
| Cancel IN_PROGRESS / READY order | No | No | Yes |
| Manage establishments | No | No | Yes |
| Review operational audit history | Limited to own order details | Relevant operational data | Yes |

The specific SQL/RLS implementation of these permissions will be defined in the security architecture.

---

# 15. Explicitly Excluded Domain Concepts

The following are not modeled as MVP entities:

- Payment.
- Invoice.
- ProductPrice.
- Warehouse.
- StockMovement.
- RawMaterial.
- Supplier.
- DeliveryRoute.
- Courier.
- MultiBakeryTenant.
- FinancialTransaction.

These exclusions follow the accepted MVP scope.

---

# 16. Domain Evolution Principles

Future changes must preserve historical data and accepted business invariants.

General principles:

1. Prefer additive changes when feasible.
2. Preserve original confirmed order information.
3. Use versioned database migrations.
4. Avoid speculative entities without current business responsibilities.
5. Do not modify unrelated domain modules.
6. Update business rules and tests whenever accepted behavior changes.
7. Evaluate security and RLS implications for every new relationship.

---

# 17. Pending Data Modeling Decisions

The following details will be defined during the technical architecture phase:

- Exact PostgreSQL column types.
- Primary and foreign key strategies.
- Numeric quantity precision.
- Product unit representation.
- Indexes and uniqueness constraints.
- Idempotency key storage and uniqueness scope.
- Authentication and onboarding implementation.
- Database policies and RPC function boundaries.
- Timestamp and timezone conventions.
- Exact OrderEvent metadata structure.
- Product image storage strategy.

This document establishes the domain contract without prematurely committing to every database implementation detail.