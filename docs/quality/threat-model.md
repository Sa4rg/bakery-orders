# FILE: docs/quality/threat-model.md

# Threat Model — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Quality Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document identifies the initial security threats relevant to the Bakery Orders MVP.

It is a living threat model.

It must evolve when the application architecture, attack surface, data sensitivity, or integrations change.

The objective is not to predict every possible attack.

The objective is to identify realistic threats early enough to design and test appropriate controls.

---

# 2. System Context

Bakery Orders contains three user groups:

```text
CUSTOMER
KITCHEN
MANAGER
```

Users interact through a browser-based React application.

The application communicates with Supabase services:

```text
Browser
   ↓
Supabase Auth
Data API
RPC
Realtime
Storage
   ↓
PostgreSQL
```

Future external providers may be added through trusted Edge Functions.

---

# 3. Protected Assets

Important assets include:

### Identity

- User identity.
- Sessions.
- Roles.
- Business memberships.

### Commercial Data

- Business information.
- Order history.
- Requested quantities.
- Delivery information.

### Operational Data

- Production queue.
- Preparation status.
- Product availability.
- Shortage reasons.

### Integrity Assets

- Order status.
- Prepared quantities.
- Unavailable quantities.
- Audit history.
- Lifecycle timestamps.

### Secrets

- Privileged Supabase credentials.
- Future external provider secrets.

---

# 4. Trust Boundaries

## TB-01 — Browser → Supabase

The browser is untrusted.

All browser requests may be manipulated.

Controls:

- Authentication.
- RLS.
- RPC authorization.
- Database constraints.

## TB-02 — Supabase Auth → Application Identity

Authentication identity must map safely to application Profile and authorization context.

Controls:

- Trusted Profile management.
- Controlled role assignment.

## TB-03 — RPC → Privileged Database Operations

Critical functions may modify protected order state.

Controls:

- Explicit permissions.
- Internal authorization.
- Transactional invariants.
- Function security review.

## TB-04 — Storage

Product image operations cross from user-controlled files into managed storage.

Controls:

- MIME/type validation.
- Size limits.
- Restricted write policies.

## TB-05 — Future External Services

Edge Functions may eventually communicate with third parties.

Controls will require:

- Secret isolation.
- Input/output validation.
- Webhook verification where applicable.

---

# 5. Primary Attackers

Threat analysis considers:

### Anonymous External User

No legitimate account.

### Malicious CUSTOMER

Valid CUSTOMER account attempting to access another establishment.

### Compromised CUSTOMER Account

Attacker controls legitimate credentials/session.

### Curious or Malicious KITCHEN User

Valid production access attempting administrative operations.

### Compromised Privileged User

Attacker controls MANAGER or other trusted account.

### Automated Attacker

Scripts attempting enumeration, abuse, injection, or resource exhaustion.

### Supply Chain Attacker

Malicious or compromised package/dependency affecting the application.

---

# 6. STRIDE Categories

Threats are analyzed using STRIDE where useful:

```text
S — Spoofing
T — Tampering
R — Repudiation
I — Information Disclosure
D — Denial of Service
E — Elevation of Privilege
```

STRIDE complements, rather than replaces, OWASP-based review.

---

# 7. Initial Threat Register

## THR-001 — Cross-Business Order Access

**Category:** Information Disclosure / Broken Access Control
**Actor:** Malicious CUSTOMER
**Scenario:**

CUSTOMER A changes an order identifier and attempts to read CUSTOMER B's order.

**Impact:** High

**Controls:**

- RLS based on active BusinessMembership.
- No ownership trust from URL parameters.
- Negative database tests.
- E2E cross-business isolation test.

**Status:** Mitigation designed.

---

## THR-002 — Unauthorized Order Mutation

**Category:** Tampering / Elevation of Privilege
**Actor:** CUSTOMER or KITCHEN
**Scenario:**

A user bypasses the UI and directly updates order status.

Example:

```text
RECEIVED → DELIVERED
```

**Impact:** High

**Controls:**

- No arbitrary client UPDATE permission on critical order state.
- Controlled RPC functions.
- Lifecycle validation.
- RLS/grant tests.

**Status:** Mitigation designed.

---

## THR-003 — Quantity Manipulation

**Category:** Tampering
**Actor:** KITCHEN or manipulated client
**Scenario:**

Prepared and unavailable quantities exceed requested quantity.

**Impact:** Medium/High operational integrity risk.

**Controls:**

- Database CHECK constraints.
- Transactional RPC.
- Concurrency tests.
- Domain validation.

**Status:** Mitigation designed.

---

## THR-004 — Role Escalation

**Category:** Elevation of Privilege
**Actor:** Authenticated user
**Scenario:**

CUSTOMER changes their Profile role to MANAGER.

**Impact:** Critical

**Controls:**

- Role cannot be self-modified.
- Restricted Profile writes.
- Trusted role assignment.
- RLS and permission tests.

**Status:** Mitigation designed.

---

## THR-005 — Membership Manipulation

**Category:** Elevation of Privilege / Information Disclosure
**Actor:** CUSTOMER
**Scenario:**

A CUSTOMER associates themselves with another Business.

**Impact:** High

**Controls:**

- Membership administration restricted.
- Business ownership derived from trusted membership.
- Negative RLS tests.

**Status:** Mitigation designed.

---

## THR-006 — Audit Record Forgery

**Category:** Repudiation / Tampering
**Actor:** Authenticated user
**Scenario:**

A user modifies or deletes OrderEvent records or impersonates another actor.

**Impact:** High

**Controls:**

- No arbitrary client mutation.
- Actor derived from authenticated context.
- Trusted timestamps.
- Append-oriented audit model.

**Status:** Mitigation designed.

---

## THR-007 — Duplicate Order Submission

**Category:** Integrity / Exceptional Condition
**Actor:** Accidental or automated
**Scenario:**

Slow connection or repeated click submits the same order multiple times.

**Impact:** Medium/High operational impact.

**Controls:**

- Idempotency key.
- Database uniqueness.
- Atomic creation.
- Automated tests.

**Status:** Mitigation designed.

---

## THR-008 — Concurrent Production Updates

**Category:** Tampering / Race Condition
**Actor:** Multiple legitimate KITCHEN users
**Scenario:**

Two users resolve the same quantity simultaneously and create an invalid total.

**Impact:** High data-integrity impact.

**Controls:**

- Transactional operations.
- Row locking or equivalent concurrency control.
- Constraints.
- Concurrency tests.

**Status:** Requires implementation validation.

---

## THR-009 — Secret Exposure

**Category:** Information Disclosure
**Actor:** External attacker
**Scenario:**

Privileged Supabase or external-provider secret is bundled into frontend code or committed to Git.

**Impact:** Critical

**Controls:**

- Client-safe credentials only in React.
- `.env` ignored.
- `.env.example` uses placeholders.
- Secret scanning before release.
- Server-side secrets only.

**Status:** Process control required.

---

## THR-010 — Injection

**Category:** Injection
**Actor:** External or authenticated attacker
**Scenario:**

Untrusted data is interpreted as executable SQL or unsafe content.

**Impact:** High

**Controls:**

- Supabase parameterization.
- Function parameters.
- No unsafe SQL concatenation.
- React text escaping.
- Avoid unreviewed HTML rendering.

**Status:** Mitigation designed.

---

## THR-011 — Malicious Product Upload

**Category:** Integrity / Injection
**Actor:** Privileged catalog user
**Scenario:**

Unexpected or malicious file is uploaded as a product image.

**Impact:** Medium

**Controls:**

- Allowed content types.
- Size restrictions.
- Controlled Storage paths.
- No arbitrary active content without review.

**Status:** Requires implementation.

---

## THR-012 — Excessive Data Exposure Through Realtime

**Category:** Information Disclosure
**Actor:** Authenticated user
**Scenario:**

Realtime subscription exposes orders that the user could not normally read.

**Impact:** High

**Controls:**

- RLS-compatible Realtime design.
- Role-specific subscriptions.
- Re-fetch authoritative data.
- Authorization tests.

**Status:** Requires implementation validation.

---

## THR-013 — Disabled Account Retains Access

**Category:** Broken Access Control
**Actor:** Previously authorized user
**Scenario:**

A Profile, Business, or membership is disabled but an existing session continues performing protected operations.

**Impact:** High

**Controls:**

- Active-state validation in sensitive operations.
- RLS where applicable.
- Session/access tests.

**Status:** Requires implementation validation.

---

## THR-014 — Sensitive Error Disclosure

**Category:** Information Disclosure / Misconfiguration
**Actor:** External user
**Scenario:**

Production error exposes SQL, stack traces, environment information, or secrets.

**Impact:** Medium/High

**Controls:**

- Safe user-facing error mapping.
- Production error review.
- No raw internal errors exposed unnecessarily.

**Status:** Requires implementation.

---

## THR-015 — Dependency Compromise

**Category:** Software Supply Chain
**Actor:** Supply-chain attacker
**Scenario:**

A dependency introduces malicious behavior or a known vulnerability.

**Impact:** Variable, potentially Critical.

**Controls:**

- Minimal dependency policy.
- Lockfile.
- Dependency scanning.
- Update review.
- CI verification.

**Status:** Continuous control.

---

# 8. Abuse Cases

The following actions must fail:

```text
CUSTOMER reads another Business order.

CUSTOMER sends arbitrary business_id
and creates order for another Business.

CUSTOMER marks order READY.

CUSTOMER confirms receipt before DISPATCHED.

KITCHEN edits establishment administration.

KITCHEN edits arbitrary Product fields through
the availability operation.

KITCHEN marks fully unavailable order READY.

User sends prepared quantity greater than requested.

User forges actor_user_id.

User forges occurred_at.

Normal user modifies OrderEvent.

Repeated submission creates duplicate order.

Anonymous user reads private operational information.
```

These scenarios should influence automated security tests.

---

# 9. Residual Risks

No security architecture eliminates all risk.

Expected residual risks include:

- Compromised legitimate credentials.
- Human administrative mistakes.
- Provider vulnerabilities.
- Dependency vulnerabilities not yet publicly known.
- Operational misuse within legitimately granted permissions.

Residual risks should be reduced through least privilege, auditability, monitoring, and controlled operational processes.

---

# 10. Threat Model Review Triggers

Review this document when:

- Authentication design is finalized.
- A new role is introduced.
- New customer data is collected.
- File uploads expand.
- Edge Functions are introduced.
- External APIs are integrated.
- Payment or pricing functionality appears.
- Multi-bakery support is introduced.
- A significant security vulnerability is discovered.
- Before significant public release.

---

# 11. Threat Model Ownership

Security is a shared engineering responsibility.

Any contributor or AI agent introducing a new trust boundary must update or explicitly evaluate this threat model.

Threats must not be dismissed solely because the frontend does not expose the relevant action.


---