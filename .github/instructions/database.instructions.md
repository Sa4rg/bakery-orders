# FILE: .github/instructions/database.instructions.md

---
applyTo: "supabase/**/*"
---

# Database Instructions — Bakery Orders

## 1. Source of Truth

PostgreSQL is the authoritative source of persisted business state.

Database design must conform to:

```text
docs/domain/business-rules.md
docs/domain/order-lifecycle.md
docs/domain/domain-model.md
docs/architecture/data-model.md
docs/architecture/security.md
```

Do not invent database behavior that contradicts these documents.

---

## 2. Migrations

Every database change uses a versioned migration.

Never edit an already-applied migration to represent a new change.

Create a new migration.

Migrations must be:

- Reproducible.
- Reviewable.
- Deterministic.
- Source controlled.

Do not rely on undocumented Dashboard changes.

---

## 3. Naming

Use PostgreSQL `snake_case`.

Examples:

```text
business_memberships
requested_quantity
created_at
```

Use clear explicit constraint and function names where practical.

---

## 4. Data Types

Use exact types appropriate to the domain.

Quantities use exact numeric representation.

Do not use floating-point values for exact product quantities.

Operational timestamps use:

```text
timestamptz
```

Trusted timestamps should normally be produced by PostgreSQL.

---

## 5. Constraints

Protect invariants at the database level when possible.

Order item constraints include:

```text
requested_quantity > 0

prepared_quantity >= 0

unavailable_quantity >= 0

prepared_quantity + unavailable_quantity
    <= requested_quantity
```

Do not depend exclusively on frontend validation.

---

## 6. Historical Data

Confirmed OrderItems preserve relevant snapshots.

At minimum:

```text
product_name_snapshot
unit_code_snapshot
quantity_step_snapshot
requested_quantity
```

Do not silently rewrite historical snapshots when Product changes.

---

## 7. Deletion

Normal application behavior does not physically delete:

```text
orders
order_items
order_events
```

Prefer deactivation for:

```text
profiles
businesses
business_memberships
categories
products
```

unless a separately approved deletion requirement exists.

---

## 8. RLS

Enable RLS on every exposed application table.

Use least privilege.

Every policy requires:

```text
positive test
+
negative test
```

Do not disable RLS to simplify application development.

Do not create broad `USING (true)` or `WITH CHECK (true)` authenticated policies without explicit architectural justification.

---

## 9. Customer Isolation

CUSTOMER access must be based on authenticated identity and valid active BusinessMembership.

Never trust arbitrary client-submitted:

```text
business_id
user_id
actor_user_id
```

as proof of authorization.

---

## 10. Critical Tables

Normal clients must not receive unrestricted mutation access to:

```text
orders
order_items
order_events
```

Critical state changes use controlled database functions.

---

## 11. RPC Functions

Critical commands include conceptually:

```text
create_order
start_order
record_prepared_quantity
record_unavailable_quantity
mark_order_ready
dispatch_order
confirm_order_delivery
cancel_order
```

Functions must validate:

1. Authentication.
2. Active Profile.
3. Role.
4. Business ownership when applicable.
5. Current lifecycle state.
6. Input values.
7. Business invariants.

Successful functions must create required audit records transactionally.

---

## 12. Concurrency

Consider concurrency whenever multiple users can modify the same resource.

Quantity updates must remain valid if two KITCHEN users act simultaneously.

Use appropriate PostgreSQL mechanisms such as:

- Transactions.
- Row locking.
- Conditional updates.
- Constraints.

Do not assume frontend sequencing prevents races.

---

## 13. SECURITY DEFINER

Prefer invoker behavior where possible.

If `SECURITY DEFINER` is necessary:

- Document why.
- Set a safe `search_path`.
- Schema-qualify objects.
- Validate caller internally.
- Review owner.
- Revoke inappropriate default EXECUTE privileges.
- Grant only necessary execution.
- Add security tests.

Never use it solely to bypass RLS problems.

---

## 14. Function Input

Use explicit parameters.

Do not construct unsafe dynamic SQL from user values.

Do not accept trusted actor or timestamp values from the browser when they can be derived server-side.

---

## 15. Audit

OrderEvent is append-oriented.

Operational users must not have unrestricted ability to:

- Insert arbitrary actors.
- Rewrite events.
- Delete events.
- Forge timestamps.

Audit events are created by trusted operations.

Do not place credentials or tokens inside event metadata.

---

## 16. Idempotency

Order creation must preserve the documented idempotency behavior.

Repeated requests with the same valid idempotency key must not create duplicate orders.

Test both:

- Repeated accidental request.
- New intentional order with a different key.

---

## 17. Realtime

Realtime publication must expose only tables needed by application behavior.

RLS and authorization requirements still apply.

Do not add tables to Realtime publication speculatively.

---

## 18. Storage

Product images live in Supabase Storage.

Database stores object references.

Storage write policies must remain role-restricted.

Do not store base64 images in Product rows.

---

## 19. Generated Types

When schema changes affect frontend contracts, regenerate Supabase TypeScript types according to the project workflow.

Generated types are infrastructure artifacts.

Do not manually edit generated database types.

---

## 20. Testing

Database changes must run relevant pgTAP tests.

Required categories include:

- Schema.
- Constraints.
- Foreign keys.
- RLS.
- Grants.
- Functions.
- Lifecycle.
- Audit.
- Idempotency.
- Concurrency where applicable.

Do not consider a migration complete merely because it applies successfully.

---

## 21. Security Review

Any change involving:

- RLS.
- Grants.
- Roles.
- Membership.
- SECURITY DEFINER.
- Function execution.
- Storage policies.

requires explicit security review and negative tests.

---

## 22. Completion Report

Report:

- Migration files.
- Functions/policies changed.
- Constraints/indexes changed.
- Database tests added.
- Commands actually executed.
- Security impact.
- Any known migration concerns.


---