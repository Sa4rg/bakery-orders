# Release Checklist — Bakery Orders

**Project:** Bakery Orders
**Purpose:** Mandatory quality and security gate
**Status:** Active
**Version:** 1.0

---

## 1. Purpose

This checklist defines the minimum verification required before a significant public release.

A release must not be approved solely because:

- The application builds.
- The UI looks complete.
- Manual happy-path testing succeeds.

Release readiness requires evidence across:

- Functionality.
- Testing.
- Database integrity.
- Security.
- Infrastructure.
- Documentation.

---

# 2. Release Information

Before starting the review, record:

```text
Release:
Commit:
Environment:
Reviewer:
Date:
```

---

# 3. Source Control

- [ ] Release commit is identified.
- [ ] Working tree contains no unintended changes.
- [ ] Required changes are committed.
- [ ] No generated secrets or local environment files are committed.
- [ ] Lockfile is up to date.
- [ ] No temporary debugging files remain.
- [ ] No commented-out security bypass remains.

---

# 4. Documentation

- [ ] Product scope reflects implemented behavior.
- [ ] Business rules reflect current behavior.
- [ ] Domain model is current.
- [ ] Architecture documentation is current.
- [ ] Relevant ADRs are current.
- [ ] Security documentation is current.
- [ ] Threat model has been reviewed.
- [ ] Known limitations are documented.

---

# 5. Code Quality

- [ ] Lint passes.
- [ ] TypeScript typecheck passes.
- [ ] Production build succeeds.
- [ ] No unexplained lint warnings remain.
- [ ] No dead debug code remains.
- [ ] No unnecessary dependency was added.
- [ ] SOLID/SRP violations in critical modules were reviewed.
- [ ] No unrelated refactoring was introduced into release-critical changes.

---

# 6. Automated Testing

- [ ] Unit tests pass.
- [ ] Component tests pass.
- [ ] Database tests pass.
- [ ] Integration tests pass.
- [ ] Required E2E tests pass.
- [ ] Critical regression tests pass.
- [ ] No tests are unexpectedly skipped.
- [ ] Coverage report reviewed.
- [ ] Critical domain rules have adequate branch coverage.

---

# 7. Database

- [ ] Local database can be rebuilt from migrations.
- [ ] `supabase db reset` succeeds.
- [ ] Seed process succeeds.
- [ ] Migration order is reproducible.
- [ ] No schema change exists only in the Dashboard.
- [ ] Foreign keys are verified.
- [ ] Critical CHECK constraints are verified.
- [ ] Unique constraints are verified.
- [ ] Required indexes exist.
- [ ] Generated TypeScript database types are current.

---

# 8. RLS & Authorization

- [ ] RLS enabled for every exposed application table.
- [ ] CUSTOMER own-data access tested.
- [ ] CUSTOMER cross-business denial tested.
- [ ] KITCHEN allowed operations tested.
- [ ] KITCHEN forbidden administrative operations tested.
- [ ] MANAGER access tested.
- [ ] Inactive Profile behavior tested.
- [ ] Inactive Business behavior tested.
- [ ] Inactive BusinessMembership behavior tested.
- [ ] Anonymous access behavior tested.
- [ ] Direct API attempts cannot bypass UI restrictions.

---

# 9. RPC & Database Functions

For every security-sensitive function:

- [ ] Authenticated caller validated.
- [ ] Role validated.
- [ ] Business ownership validated where required.
- [ ] Current lifecycle state validated.
- [ ] Input values validated.
- [ ] Transaction behavior tested.
- [ ] Audit event behavior tested.
- [ ] Unauthorized EXECUTE behavior tested.
- [ ] Race-condition-sensitive behavior reviewed.

For each `SECURITY DEFINER` function:

- [ ] Use is justified.
- [ ] Owner reviewed.
- [ ] Safe `search_path` configured.
- [ ] Referenced objects are appropriately qualified.
- [ ] PUBLIC EXECUTE reviewed/revoked as appropriate.
- [ ] Explicit authorization exists inside the function.
- [ ] Dedicated security tests pass.

---

# 10. Order Integrity

- [ ] Empty orders rejected.
- [ ] Unavailable products rejected on confirmation.
- [ ] Duplicate order submission prevented.
- [ ] Order creation is atomic.
- [ ] Original product snapshots preserved.
- [ ] Requested quantities remain immutable.
- [ ] Prepared + unavailable cannot exceed requested.
- [ ] Invalid lifecycle transitions rejected.
- [ ] Fully unavailable order cannot become READY.
- [ ] Cancellation rules enforced.
- [ ] DISPATCHED → DELIVERED requires correct CUSTOMER.
- [ ] Audit events created for critical operations.

---

# 11. Realtime

- [ ] CUSTOMER receives only authorized updates.
- [ ] KITCHEN subscriptions expose only required data.
- [ ] MANAGER subscriptions behave as expected.
- [ ] Reconnect/refetch behavior works.
- [ ] Application remains correct if Realtime event is missed.
- [ ] Realtime is not treated as source of truth.

---

# 12. Storage

If product image functionality exists:

- [ ] Read policy reviewed.
- [ ] Write policy reviewed.
- [ ] Unauthorized upload tested.
- [ ] File size validation tested.
- [ ] Allowed content types reviewed.
- [ ] Object path generation reviewed.
- [ ] Deletion/replacement permissions reviewed.

---

# 13. Authentication

- [ ] Final login mechanism reviewed.
- [ ] Login failure behavior reviewed.
- [ ] Session restoration tested.
- [ ] Logout tested.
- [ ] Protected route behavior tested.
- [ ] Protected data access tested independently of route guards.
- [ ] Deactivated-user behavior tested.
- [ ] No authentication secrets stored in application tables.

---

# 14. Secrets & Configuration

- [ ] No privileged key exists in frontend bundle.
- [ ] No real secrets exist in `.env.example`.
- [ ] Production secrets configured through trusted environment management.
- [ ] Git history checked for accidental secret exposure where appropriate.
- [ ] Client-visible environment variables reviewed.
- [ ] Supabase project settings reviewed.
- [ ] Production URLs reviewed.
- [ ] Debug/development flags disabled where necessary.

---

# 15. Dependency Security

- [ ] Dependency vulnerability scan reviewed.
- [ ] Critical findings resolved.
- [ ] High findings resolved or explicitly assessed.
- [ ] Newly added dependencies justified.
- [ ] Unused dependencies removed.
- [ ] Lockfile matches release.

---

# 16. OWASP Security Review

Review exposure to:

- [ ] A01 Broken Access Control.
- [ ] A02 Security Misconfiguration.
- [ ] A03 Software Supply Chain Failures.
- [ ] A04 Cryptographic Failures.
- [ ] A05 Injection.
- [ ] A06 Insecure Design.
- [ ] A07 Authentication Failures.
- [ ] A08 Software or Data Integrity Failures.
- [ ] A09 Security Logging and Alerting Failures.
- [ ] A10 Mishandling of Exceptional Conditions.

Applicable ASVS controls must also be considered.

---

# 17. Error Handling

- [ ] Failed operations do not report success.
- [ ] Raw SQL errors are not unnecessarily exposed.
- [ ] Stack traces are not exposed in production UI.
- [ ] Secrets do not appear in error output.
- [ ] User-facing errors provide safe recovery guidance.
- [ ] Exceptional states fail safely.

---

# 18. Privacy & Data

- [ ] Only necessary user/business information is stored.
- [ ] Demo data is fictional.
- [ ] No accidental real customer data exists in repository.
- [ ] Sensitive information is not logged unnecessarily.
- [ ] Data access matches business purpose.

---

# 19. E2E Release Flows

The release must verify:

- [ ] Complete-order workflow.
- [ ] Partial-fulfillment workflow.
- [ ] Customer cancellation.
- [ ] Manager cancellation.
- [ ] Total-unavailability workflow.
- [ ] Customer receipt confirmation.
- [ ] Repeat-order workflow.
- [ ] Cross-business isolation.
- [ ] Product availability change behavior.

---

# 20. Manual Exploratory Review

Automated tests do not replace manual review.

Perform exploratory testing for:

- [ ] CUSTOMER mobile layout.
- [ ] KITCHEN operational workflow.
- [ ] MANAGER dashboard.
- [ ] Slow loading.
- [ ] Empty states.
- [ ] Error states.
- [ ] Network interruption.
- [ ] Double-click/repeated submission.
- [ ] Browser refresh during important flows.
- [ ] Long names and large quantities.
- [ ] Multiple simultaneous orders.

---

# 21. Accessibility & UX

- [ ] Core actions usable with keyboard where applicable.
- [ ] Inputs have labels.
- [ ] Interactive controls have accessible names.
- [ ] Status does not rely solely on color.
- [ ] Error messages are understandable.
- [ ] Loading state is visible.
- [ ] Disabled states are understandable.
- [ ] Mobile layout reviewed on representative viewport sizes.

---

# 22. Performance Sanity Review

- [ ] No obvious N+1-style data loading pattern exists.
- [ ] Large lists are queried intentionally.
- [ ] Database indexes support important order queries.
- [ ] Images are reasonably optimized.
- [ ] Initial application load is acceptable.
- [ ] Realtime subscriptions are not duplicated accidentally.

Formal performance testing may be introduced when measured requirements exist.

---

# 23. Backup & Recovery

Before real business-critical production adoption:

- [ ] Backup capabilities reviewed.
- [ ] Recovery expectations documented.
- [ ] Database migration rollback/recovery strategy reviewed.
- [ ] Responsibility for operational cost and backups defined.

Free-tier limitations must be explicitly understood before relying on the application for critical business operations.

---

# 24. Known Risks

Before release, list unresolved items:

```text
Risk:
Severity:
Reason unresolved:
Mitigation:
Owner:
Decision:
```

Critical and High security risks block release by default.

---

# 25. Final Release Decision

A release may be classified as:

```text
APPROVED
APPROVED WITH DOCUMENTED RISK
BLOCKED
```

The decision must be based on evidence collected through this checklist.

---

# 26. Post-Release

After release:

- [ ] Verify deployed application loads correctly.
- [ ] Verify authentication.
- [ ] Verify a safe representative order flow.
- [ ] Verify no obvious permission regression exists.
- [ ] Monitor initial errors.
- [ ] Record unexpected issues.
- [ ] Create regression tests for confirmed defects.

---

# 27. Principle

A successful deployment is not the same as a safe release.

The application is ready only when its functionality, integrity, authorization, security, and operational behavior have been deliberately verified.