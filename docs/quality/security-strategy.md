# Security Strategy — Bakery Orders

**Project:** Bakery Orders
**Phase:** Sprint 0 — Quality Definition
**Status:** Draft — Pending Approval
**Version:** 1.0

---

## 1. Purpose

This document defines how security is incorporated throughout the Bakery Orders software development lifecycle.

Technical security architecture is documented separately in:

`docs/architecture/security.md`

This document defines the process used to:

- Prevent vulnerabilities.
- Identify threats.
- Verify controls.
- Review changes.
- Manage security defects.
- Establish release security gates.

Security is continuous work.

It is not a final pre-production task.

---

# 2. Security References

The project uses:

- OWASP Top 10:2025 as a high-level application security risk reference.
- OWASP ASVS 5.0.0 as a security verification reference.
- Supabase security guidance for platform-specific controls.
- Principle of least privilege.
- Defense in depth.
- Secure-by-default design.

References must be interpreted according to the application's actual architecture.

---

# 3. Secure Development Lifecycle

Security activities exist throughout development.

```text
Requirements
      ↓
Threat Modeling
      ↓
Architecture
      ↓
Implementation
      ↓
Security Tests
      ↓
Code Review
      ↓
Release Security Audit
      ↓
Deployment
      ↓
Monitoring / Feedback
```

Security review must not begin only after implementation is finished.

---

# 4. Security During Product Definition

New functionality must answer:

- Who can perform this operation?
- Who owns the affected data?
- Who can read it?
- Who can modify it?
- What happens if the browser request is manipulated?
- What information must remain auditable?
- What sensitive information is involved?
- What happens when the operation fails halfway?
- Could concurrent operations violate an invariant?

Security-relevant uncertainty must be documented instead of silently assumed.

---

# 5. Security During Architecture

Architectural decisions must evaluate:

- Trust boundaries.
- Authentication.
- Authorization.
- Data exposure.
- Secret handling.
- Transaction integrity.
- Storage access.
- Realtime exposure.
- External integrations.
- Error handling.
- Auditability.

Security-sensitive architecture changes require an ADR where appropriate.

---

# 6. Security During Implementation

Every implementation must follow:

- Least privilege.
- Explicit input validation.
- Trusted server-side authorization.
- Parameterized data access.
- No hardcoded secrets.
- No arbitrary mass assignment.
- Safe error handling.
- Explicit ownership checks.
- Auditable critical operations.

Frontend restrictions alone never count as authorization.

---

# 7. Security Test-Driven Development

Security behavior should be tested alongside functional behavior.

Example:

```text
Requirement:
CUSTOMER can read own order.

Positive test:
CUSTOMER A reads Order A → ALLOWED

Negative test:
CUSTOMER A reads Order B → DENIED
```

Both sides are required.

A security control without an adversarial test is considered incomplete for critical paths.

---

# 8. Security Review Triggers

A focused security review is mandatory when changes affect:

- Authentication.
- Authorization.
- Roles.
- Business memberships.
- RLS.
- RPC functions.
- SECURITY DEFINER functions.
- Database grants.
- Product uploads.
- External integrations.
- Secret management.
- User-generated content.
- Audit data.
- Lifecycle permissions.
- Personally identifiable information.

---

# 9. OWASP-Oriented Development Review

The project explicitly considers the OWASP Top 10:2025 categories.

## A01 — Broken Access Control

Primary controls:

- RLS.
- Role checks.
- Membership validation.
- RPC authorization.
- Negative authorization tests.

This is one of the highest-priority risks for Bakery Orders.

## A02 — Security Misconfiguration

Review:

- Supabase settings.
- RLS coverage.
- Storage policies.
- Grants.
- Environment variables.
- CORS or future Edge Function configuration.
- Production error behavior.

## A03 — Software Supply Chain Failures

Controls:

- Locked dependency versions.
- Dependency review.
- Minimal dependencies.
- Security update process.
- CI verification.
- Review package provenance when risk justifies it.

## A04 — Cryptographic Failures

The application must:

- Use secure platform authentication mechanisms.
- Use HTTPS in deployed environments.
- Avoid custom cryptography.
- Avoid storing authentication secrets unnecessarily.

## A05 — Injection

Controls:

- Parameterized database interaction.
- Static SQL where practical.
- Controlled RPC input.
- No unsafe dynamic SQL.
- Safe rendering of customer-provided content.

## A06 — Insecure Design

Controls:

- Threat modeling.
- Documented business rules.
- Trusted lifecycle enforcement.
- Idempotency.
- Concurrency controls.
- Explicit abuse-case analysis.

## A07 — Authentication Failures

Controls:

- Supabase Auth.
- Secure session management.
- Controlled onboarding.
- No custom password storage.
- Account deactivation enforcement.

## A08 — Software or Data Integrity Failures

Controls:

- Versioned migrations.
- Protected CI.
- Audit trail.
- Controlled privileged functions.
- Dependency integrity.
- Transactional operations.

## A09 — Security Logging and Alerting Failures

The system must preserve meaningful security and business audit information.

Production monitoring requirements will evolve before real operational adoption.

## A10 — Mishandling of Exceptional Conditions

Errors must fail safely.

Examples:

- Failed mutation must not report success.
- Partial transaction must roll back.
- Realtime disconnection must not create fake state.
- Unknown lifecycle state must not silently continue.

---

# 10. ASVS Usage

ASVS is used as a verification reference rather than blindly implementing every possible requirement.

Applicable requirements should be selected based on:

- Architecture.
- Authentication mechanism.
- Data sensitivity.
- Deployment model.
- Attack surface.

When referencing a specific ASVS requirement in long-lived documentation, include its version identifier.

---

# 11. Threat Modeling

Threat modeling is maintained in:

```text
docs/quality/threat-model.md
```

It must be reviewed when:

- A new trust boundary appears.
- A new external integration is introduced.
- Authentication changes.
- File uploads expand.
- Sensitive data scope changes.
- A major feature changes authorization behavior.
- Before significant public releases.

---

# 12. Security Code Review

Security-sensitive pull requests must review:

- Authorization.
- Data ownership.
- Input validation.
- Error behavior.
- Secrets.
- Auditability.
- RLS.
- RPC permissions.
- Transaction boundaries.

Reviewers must inspect the actual security boundary, not only React behavior.

---

# 13. Dependency Security

Dependencies must have a clear purpose.

Before adding a dependency:

1. Confirm the need.
2. Consider platform/native alternatives.
3. Check project activity and maintenance.
4. Evaluate known security issues.
5. Avoid unnecessary transitive dependency growth.

Lockfiles are committed.

Unused dependencies should be removed.

---

# 14. Secrets Management

Secrets must never enter:

- Source code.
- Git history.
- Documentation.
- Test snapshots.
- Screenshots.
- AI prompts.
- Client bundles.

`.env.example` contains variable names and safe placeholders only.

Frontend variables must be assumed publicly observable after build.

---

# 15. Database Security Review

Every migration introducing a table or RPC must consider:

```text
RLS required?
Who receives SELECT?
Who receives INSERT?
Who receives UPDATE?
Who receives DELETE?
Who receives EXECUTE?
What negative tests are required?
```

A database feature is not complete until permission behavior is tested.

---

# 16. SECURITY DEFINER Review

Every use of `SECURITY DEFINER` receives explicit review.

The implementation must verify:

- Why invoker security is insufficient.
- Function owner.
- `search_path`.
- Qualified database objects.
- EXECUTE grants.
- Internal authorization.
- Input validation.
- Tests proving unauthorized access fails.

No implementation agent may introduce `SECURITY DEFINER` merely to bypass an RLS difficulty.

---

# 17. File Upload Review

Product image upload functionality must validate:

- Actor authorization.
- File type.
- File size.
- Destination path.
- Storage policy.
- Replacement/deletion permissions.

Future customer-upload functionality requires a new threat assessment.

---

# 18. Security Defect Severity

Security findings are classified approximately as:

### Critical

Likely severe compromise such as:

- Privileged secret exposure.
- Authentication bypass.
- Cross-business unrestricted data access.
- Remote execution or equivalent catastrophic compromise.

### High

Significant unauthorized access or modification with realistic exploitation.

### Medium

Security weakness requiring meaningful conditions or producing limited impact.

### Low

Hardening issue with limited practical impact.

Severity should consider both technical exploitability and actual business impact.

---

# 19. Vulnerability Handling

When a security defect is discovered:

1. Reproduce it safely.
2. Assess impact.
3. Stop public release when severity requires it.
4. Add a regression test where practical.
5. Fix the underlying control.
6. Re-run affected security tests.
7. Review similar code paths.
8. Document significant lessons or architectural changes.

Do not merely hide a vulnerable UI action.

---

# 20. Security Release Policy

Critical or High unresolved vulnerabilities block public release by default.

Exceptions require:

- Explicit risk evaluation.
- Business justification.
- Mitigation.
- Documented acceptance.

Convenience or deadlines alone are insufficient justification.

---

# 21. AI Agent Security Rules

AI-assisted implementation must:

- Read relevant security documentation before sensitive changes.
- Never weaken RLS to make tests pass.
- Never expose privileged credentials.
- Never bypass an authorization problem through frontend hiding.
- Never expand permissions beyond the requested scope.
- Never introduce dependencies silently.
- Report security assumptions explicitly.

When uncertain about a permission, deny-by-default and surface the decision for review.

---

# 22. Periodic Security Audits

Security reviews occur:

### Feature Level

For security-sensitive functionality.

### Milestone Level

After major domains such as authentication or ordering are completed.

### Release Level

Before every significant public release.

### Incident Level

After significant vulnerabilities or suspicious behavior.

---

# 23. Security Evidence

A release security review should produce evidence such as:

- Passing RLS tests.
- Passing authorization E2E tests.
- Dependency scan results.
- Reviewed environment configuration.
- Completed release checklist.
- Threat model review.
- Known-risk register.

Security confidence should be based on evidence, not assumption.

---

# 24. Security Definition of Done

Security-sensitive work is complete only when:

- Authorization is defined.
- Authorization is server-side.
- Inputs are validated.
- Required audit behavior exists.
- Positive tests pass.
- Negative tests pass.
- Secrets remain protected.
- Error paths fail safely.
- Documentation is updated when behavior changed.

---

# 25. Continuous Improvement

Security requirements will evolve.

Changes to external providers, Supabase capabilities, OWASP guidance, deployment architecture, or real business requirements may require this document to change.

Security architecture must evolve deliberately, not silently.