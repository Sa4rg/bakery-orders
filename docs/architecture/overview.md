# Architecture Overview — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Architecture Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document defines the high-level technical architecture of Bakery Orders.

It establishes:

- Application boundaries.
- Responsibilities of React and Supabase.
- Frontend modular organization.
- Backend responsibilities.
- Database and security boundaries.
- Trusted mutation patterns.
- Realtime responsibilities.
- Local development strategy.
- Testing boundaries.
- Architectural dependency rules.

This document must be read together with:

- `docs/product/vision.md`
- `docs/product/scope.md`
- `docs/domain/business-rules.md`
- `docs/domain/domain-model.md`
- `docs/domain/order-lifecycle.md`
- `docs/architecture/security.md`
- `docs/architecture/data-model.md`

---

# 2. Architectural Style

Bakery Orders uses:

**Single Page Application + Backend as a Service + PostgreSQL transactional functions**

The frontend is implemented with React and TypeScript.

Supabase provides the backend platform:

- PostgreSQL.
- Authentication.
- Data API.
- Row Level Security.
- Database Functions / RPC.
- Realtime.
- Storage.
- Edge Functions when server-side external integrations are required.

There is no independent Express or NestJS application in MVP V1.

This does not mean the application has no backend.

Supabase and PostgreSQL constitute the backend.

---

# 3. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│                  USERS                       │
│                                              │
│   CUSTOMER       KITCHEN       MANAGER       │
└────────────┬───────────┬───────────┬─────────┘
             │           │           │
             └───────────┼───────────┘
                         │
                         ▼
┌──────────────────────────────────────────────┐
│             React + TypeScript               │
│                                              │
│  UI                                          │
│  Application Use Cases                       │
│  Domain Rules                                │
│  Validation                                  │
│  Data Access                                 │
└──────────────────────┬───────────────────────┘
                       │
                supabase-js
                       │
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
    Data API          RPC         Realtime
          │            │             │
          └────────────┼─────────────┘
                       ▼
┌──────────────────────────────────────────────┐
│                 Supabase                     │
│                                              │
│ PostgreSQL                                   │
│ ├── Tables                                   │
│ ├── Constraints                              │
│ ├── RLS Policies                             │
│ ├── Database Functions                       │
│ ├── Transactions                             │
│ └── Audit Data                               │
│                                              │
│ Auth                                         │
│ Storage                                      │
│ Realtime                                     │
│ Edge Functions (when required)               │
└──────────────────────────────────────────────┘
```

---

# 4. Source of Truth

PostgreSQL is the authoritative source of truth for persisted business state.

React must never be considered authoritative for:

- User permissions.
- Establishment ownership.
- Order lifecycle status.
- Prepared quantities.
- Unavailable quantities.
- Cancellation authorization.
- Audit actor identity.
- Trusted timestamps.

Realtime is also not a source of truth.

Realtime communicates persisted changes to connected interfaces.

If Realtime is temporarily disconnected, the current persisted database state remains authoritative and must be recoverable through normal queries.

---

# 5. Frontend Architecture

The frontend follows:

- Feature-based architecture.
- Screaming Architecture principles.
- Pragmatic Domain-Driven Design.
- SOLID principles.
- Explicit separation of concerns.
- Scope Rule inherited from previous project experience.

The project avoids excessive Clean Architecture ceremony.

Architecture exists to clarify responsibilities, not to create unnecessary abstractions.

---

# 6. Frontend Structure

Initial target structure:

```text
src/
│
├── app/
│   ├── router/
│   ├── providers/
│   ├── layouts/
│   └── App.tsx
│
├── features/
│   ├── auth/
│   ├── catalog/
│   ├── cart/
│   ├── orders/
│   ├── production/
│   ├── tracking/
│   ├── businesses/
│   └── management/
│
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   ├── constants/
│   └── types/
│
├── lib/
│   └── supabase/
│       ├── client.ts
│       └── database.types.ts
│
└── main.tsx
```

Not every directory must be created immediately.

Directories should appear when they contain an actual responsibility.

---

# 7. Scope Rule

Code belongs as close as possible to the feature that owns it.

## Local Scope

Code used only by one feature remains inside that feature.

Example:

```text
features/orders/
```

may contain:

```text
domain/
application/
data/
components/
pages/
```

## Global Scope

Code moves to `shared/` only when it is genuinely reusable across multiple independent features.

Examples:

```text
shared/components/Button.tsx
shared/utils/date.ts
shared/types/result.ts
```

A component must not be placed in `shared/` merely because it might become reusable in the future.

YAGNI applies.

---

# 8. Feature Internal Structure

Complex features may use:

```text
features/orders/
│
├── domain/
│   ├── order.types.ts
│   ├── order.schemas.ts
│   └── order.rules.ts
│
├── application/
│   ├── useCreateOrder.ts
│   └── useOrders.ts
│
├── data/
│   ├── createOrder.ts
│   ├── getOrders.ts
│   └── subscribeToOrders.ts
│
├── components/
│
└── pages/
```

This structure is not mandatory for trivial features.

The project must avoid empty architectural layers created only for consistency.

---

# 9. Layer Responsibilities

## UI

Responsible for:

- Rendering.
- User interaction.
- Loading states.
- Empty states.
- Error presentation.
- Accessibility.
- Visual feedback.

UI must not contain critical authorization or persistence rules.

## Domain

Responsible for:

- Domain concepts.
- Pure business calculations.
- Client-side representations of business rules.
- Zod schemas associated with domain input.
- Derived values.

Domain code should remain independent from React whenever practical.

## Application

Responsible for:

- Use-case coordination.
- UI-facing workflows.
- Combining domain logic and data operations.
- Query/mutation orchestration.

## Data

Responsible for:

- Supabase Data API queries.
- RPC calls.
- Realtime subscriptions.
- Mapping infrastructure responses.

React components must not contain scattered direct database calls when a feature data boundary exists.

---

# 10. Input Validation

Frontend forms use:

- React Hook Form.
- Zod.
- TypeScript.

Zod provides runtime input validation and normalization.

TypeScript provides compile-time type checking.

Neither replaces trusted backend validation.

Validation responsibilities:

```text
React Hook Form
        ↓
Zod
        ↓
Application Use Case
        ↓
Supabase RPC / Data API
        ↓
PostgreSQL Constraints + RLS + Functions
```

Security-sensitive business rules must remain enforceable even if all frontend validation is bypassed.

---

# 11. Read Architecture

Simple authorized reads may use Supabase Data API directly.

Examples:

- Read available products.
- Read categories.
- Read own orders.
- Read order details.
- Read production queue.
- Read establishments when authorized.

RLS determines which rows an authenticated user may read.

Frontend filtering is never an authorization mechanism.

---

# 12. Mutation Architecture

Not every mutation has the same security requirements.

## Simple Administrative Mutations

Simple CRUD operations may use the Data API when:

- RLS provides sufficient authorization.
- Database constraints protect integrity.
- No multi-table transaction is required.
- No privileged operation is required.

Example:

MANAGER editing a product description.

## Critical Business Mutations

Critical operations must use controlled PostgreSQL RPC functions.

Examples:

- Create order.
- Start order preparation.
- Register prepared quantity.
- Register unavailable quantity.
- Mark order ready.
- Dispatch order.
- Confirm delivery.
- Cancel order.

These operations affect business invariants and must not be implemented as arbitrary direct table updates from React.

---

# 13. Initial RPC Boundary

Expected application commands include conceptually:

```text
create_order(...)
start_order(...)
record_prepared_quantity(...)
record_unavailable_quantity(...)
mark_order_ready(...)
dispatch_order(...)
confirm_order_delivery(...)
cancel_order(...)
set_product_availability(...)
```

Exact SQL signatures will be designed during implementation.

RPC functions must:

1. Authenticate the caller.
2. Authorize the caller.
3. Validate current state.
4. Validate input.
5. Lock relevant rows when concurrency matters.
6. Apply the change transactionally.
7. Generate required audit events.
8. Return the persisted result.

---

# 14. Database Functions vs Edge Functions

Database functions are preferred when logic is primarily:

- Transactional.
- Data-intensive.
- Closely related to PostgreSQL state.
- Required to enforce order consistency.

Edge Functions are reserved for cases requiring:

- External APIs.
- Server-side secrets.
- Webhooks.
- Third-party integrations.
- Processing that does not belong inside a database transaction.

Examples of future Edge Function usage:

```text
WhatsApp API
Email provider
External logistics provider
Invoice service
```

No Edge Function should be introduced when a normal database function is sufficient.

---

# 15. Authentication

Supabase Auth manages:

- User identities.
- Sessions.
- Authentication tokens.

Application-specific information is stored separately in `profiles`.

The application must not duplicate:

- Passwords.
- Password hashes.
- Access tokens.
- Refresh tokens.

Roles must be assigned through a trusted process.

Users must never be able to grant themselves MANAGER or KITCHEN permissions.

The exact CUSTOMER login UX remains a product decision.

---

# 16. Authorization

Authorization is primarily enforced by:

```text
Supabase Auth
      +
PostgreSQL RLS
      +
RPC authorization
```

CUSTOMER access additionally depends on active BusinessMembership.

A client-submitted `business_id` is never sufficient proof of authorization.

Critical RPC functions derive trusted identity using the authenticated session context.

---

# 17. Realtime Architecture

Supabase Realtime is used to synchronize operational interfaces.

Expected subscriptions include:

- New orders.
- Order status changes.
- Order-item quantity changes.
- Product availability changes.

Examples:

```text
CUSTOMER
Order tracking changes

KITCHEN
New incoming orders
Order updates

MANAGER
Operational dashboard changes
```

Realtime events must trigger cache/state synchronization rather than becoming independent business commands.

The database remains authoritative.

After reconnecting, interfaces must refetch current persisted data.

---

# 18. Cart Architecture

The cart is a pre-order client-side concept in MVP V1.

It does not require persistent database storage initially.

The cart may use:

- React application state.
- Feature-local state.
- Browser persistence if later justified.

No global state library is selected at architecture level yet.

A dependency must not be introduced until a concrete state-management requirement justifies it.

Repeat Order creates a new cart from historical order data.

The resulting cart is always revalidated before confirmation.

---

# 19. Product Images

Product binary content is stored through Supabase Storage.

PostgreSQL stores only the object path or logical reference.

Example:

```text
products/550e8400.../main.webp
```

Database rows should not contain base64 image data.

Public product images may use a public-readable bucket if approved by the security design.

Write operations remain restricted.

---

# 20. Database Change Management

Database schema changes use versioned migrations.

Expected repository structure:

```text
supabase/
│
├── config.toml
├── migrations/
├── functions/
├── tests/
└── seed.sql
```

Already-applied migrations must not be rewritten to represent later changes.

A new migration must be created.

Development workflow:

```text
Migration
   ↓
Local Supabase
   ↓
Database Tests
   ↓
Integration Tests
   ↓
Generated TypeScript Types
   ↓
Remote Development Project
```

---

# 21. Local Development

Supabase runs locally using the Supabase CLI and a compatible container runtime.

Local services are used for:

- PostgreSQL.
- Auth.
- Storage.
- Realtime.
- Database functions.
- Database testing.

The local environment is strictly a development environment.

It must not be exposed publicly.

---

# 22. Generated Database Types

PostgreSQL-generated TypeScript types must be committed or generated reproducibly according to the selected workflow.

Conceptual command:

```text
supabase gen types --lang typescript
```

Generated database types are infrastructure contracts.

They do not automatically replace domain-specific types or Zod validation.

---

# 23. Testing Architecture

The project uses multiple complementary testing levels.

```text
Unit
│
├── Domain rules
├── Zod schemas
└── Pure utilities

Component
│
└── React Testing Library

Database
│
├── RLS
├── SQL constraints
├── Functions
└── Permissions

Integration
│
└── React/Supabase boundaries

E2E
   └── Critical user workflows
```

Tools:

- Vitest.
- React Testing Library.
- pgTAP.
- Local Supabase.
- Playwright.

Testing follows TDD for new business behavior.

---

# 24. Dependency Rules

The following dependencies are prohibited:

```text
shared → feature
```

`shared` must not know application features.

Features should not access another feature's private implementation details.

Prefer explicit public feature APIs when cross-feature collaboration becomes necessary.

UI components must not import database infrastructure directly when a feature data layer already exists.

Domain code must not depend on React unless there is a specific UI responsibility.

---

# 25. SOLID Principles

SOLID principles guide implementation pragmatically.

Particular emphasis is placed on Single Responsibility.

A function, component, hook, or module should have one cohesive reason to change.

Examples:

Good:

```text
validateOrderQuantity()
createOrder()
OrderStatusBadge
useOrderTracking()
```

Avoid:

```text
OrderEverythingManager.tsx
```

that simultaneously:

- Fetches orders.
- Mutates orders.
- Manages authentication.
- Calculates quantities.
- Controls modals.
- Renders hundreds of lines of UI.

SOLID must improve maintainability.

It must not be used to justify unnecessary interfaces or abstraction layers.

---

# 26. Architectural Non-Goals

MVP V1 does not introduce:

- Microservices.
- Event sourcing.
- CQRS infrastructure.
- Separate API server.
- Repository abstractions around every Supabase query.
- General-purpose dependency injection containers.
- Redux or another global state library without need.
- Persistent cart infrastructure without need.
- Background job infrastructure without need.

These may only be reconsidered when a real requirement justifies them.

---

# 27. Architecture Evolution

Architecture decisions may evolve.

Changes must be:

1. Justified.
2. Incremental.
3. Documented.
4. Tested.
5. Security-reviewed when relevant.

Significant changes require an ADR.

The project's objective is not architectural purity.

The objective is a secure, understandable, testable, and maintainable real-world system.