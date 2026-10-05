Security Architecture — Bakery Orders

Project: Bakery Orders
Phase: Sprint 0 — Architecture Definition
Status: Draft — Pending Approval
Version: 1.0

1. Purpose

This document defines the security architecture and mandatory security principles for Bakery Orders.

Security is a design requirement, not a final-stage feature.

The application follows:

Security by design.

Least privilege.

Defense in depth.

Deny by default where practical.

Trusted backend authorization.

Data minimization.

Auditability.

OWASP-oriented security review.

OWASP Top 10:2025 is used as the primary high-level risk reference.

OWASP ASVS is used as a complementary verification framework.

2. Security Objectives

The system must protect:

Customer establishment information.

Order information.

Production information.

User identities.

Authorization boundaries.

Audit history.

Database integrity.

Application credentials and secrets.

The most critical security property is:

A user must never gain access to operations or data outside their authorized scope by manipulating the frontend or calling Supabase directly.

3. Primary Trust Boundary

React runs on the user's device.

Therefore React is untrusted from an authorization perspective.

Users can:

Inspect frontend code.

Modify JavaScript.

Change network requests.

Call Supabase directly.

Remove client-side validation.

Modify local application state.

Consequently:

Frontend validation ≠ Security boundary
Frontend route protection ≠ Authorization boundary
Hidden button ≠ Permission

Trusted controls live in:

Supabase Auth
PostgreSQL permissions
RLS
Database constraints
Controlled RPC functions

4. Authentication

Authentication is delegated to Supabase Auth.

The application must not implement custom password storage.

The application must never store:

Plaintext passwords.

Password hashes.

Access tokens in application database tables.

Refresh tokens in application database tables.

Application Profiles reference authenticated identities.

5. Role Assignment

Supported application roles:

CUSTOMER
KITCHEN
MANAGER

Role assignment is privileged.

Normal users must never:

Create their own privileged Profile.

Modify their own role.

Promote themselves.

Modify establishment memberships arbitrarily.

Role changes require a trusted administrative process.

6. Authorization Model

Authorization combines:

Authenticated identity
        +
Application role
        +
BusinessMembership
        +
Resource state

Example CUSTOMER access:

auth.uid()
    ↓
Profile
    ↓
Active BusinessMembership
    ↓
Business
    ↓
Order

The browser must not be trusted to determine ownership.

7. Row Level Security

RLS is mandatory for every application table exposed through the Data API.

Policies must follow least privilege.

No sensitive table should rely on the assumption that users will only call the intended React code.

RLS must cover at least:

profiles
businesses
business_memberships
categories
products
orders
order_items
order_events

8. Default-Deny Philosophy

New tables exposed to authenticated users must not become accessible accidentally.

When a table is introduced:

Define required grants.

Enable RLS.

Define explicit policies.

Test authorized access.

Test unauthorized access.

A feature is incomplete until both positive and negative authorization behavior is tested.

9. CUSTOMER Isolation

CUSTOMER must not access unrelated establishments.

Negative tests must explicitly verify scenarios such as:

Customer A → Order A ✅

Customer A → Order B ❌

Customer A → Business B ❌

Customer A → OrderItem B ❌

Customer A → OrderEvent B ❌

Changing URL parameters or request payloads must not bypass this rule.

10. KITCHEN Authorization

KITCHEN requires broad operational visibility but limited administration.

KITCHEN may:

Read production orders.

Start preparation.

Record prepared quantities.

Record unavailable quantities.

Complete preparation.

Dispatch orders.

Update product availability.

KITCHEN must not automatically gain permission to:

Create MANAGER users.

Edit establishment administration.

Edit arbitrary Product properties.

Rewrite audit events.

Modify orders through arbitrary table updates.

11. MANAGER Authorization

MANAGER has broader administrative privileges.

MANAGER may:

Maintain catalog information.

Maintain establishments.

Review orders.

Review audit information.

Perform authorized cancellations.

MANAGER privileges must still be explicit.

MANAGER does not receive unrestricted access to authentication secrets or platform-level Supabase administration.

12. Direct Table Mutations

Critical order state must not be directly writable from the browser.

Normal authenticated users should not receive arbitrary direct update capability for:

orders
order_items
order_events

Critical changes go through controlled commands.

This protects against requests such as:

UPDATE orders
SET status = 'DELIVERED'

performed outside the intended workflow.

13. Database Functions

Critical RPC functions must validate:

Authenticated caller.

Active Profile.

Required application role.

Business membership where relevant.

Current resource state.

Input values.

Domain invariants.

Functions must not trust actor IDs supplied by clients.

Conceptually:

actor_user_id = auth.uid()

or another trusted identity mapping.

14. SECURITY INVOKER vs SECURITY DEFINER

Prefer normal invoker behavior when RLS and standard permissions are sufficient.

SECURITY DEFINER must only be used when justified.

Every SECURITY DEFINER function must:

Have a deliberately controlled owner.

Set a safe search_path.

Prefer an empty search_path where practical.

Schema-qualify referenced relations.

Validate authorization internally.

Have public EXECUTE privileges revoked.

Grant EXECUTE only to required roles.

Avoid dynamic SQL unless unavoidable and securely parameterized.

Have dedicated security tests.

Using SECURITY DEFINER is a privileged architectural decision, not a shortcut around RLS.

15. Function Permissions

Database functions must not rely on permissive defaults.

Sensitive functions require explicit EXECUTE grants.

Conceptually:

REVOKE EXECUTE FROM PUBLIC
GRANT EXECUTE TO authenticated

Actual grants must be defined in migrations.

Authorization inside the function remains required because all application users share the database-level authenticated role.

16. SQL Injection

Application SQL must use static SQL and parameterized function arguments.

Never concatenate untrusted user input into dynamic SQL.

Dynamic identifiers require exceptional justification and security review.

Search, filters, and text values must remain data, not executable SQL fragments.

17. Input Validation

Validation occurs at multiple layers.

Browser

Zod improves:

UX.

Error feedback.

Input normalization.

Database Function

Validates trusted business operations.

PostgreSQL Constraints

Protect invariants regardless of application behavior.

Example:

prepared_quantity + unavailable_quantity
    <= requested_quantity

No single validation layer replaces the others.

18. Mass Assignment

User-submitted objects must not be mapped blindly to database rows.

Avoid patterns equivalent to:

update products set {...requestBody}

without explicit field control.

Commands must whitelist accepted inputs.

KITCHEN product availability operations must not permit editing product names, categories, or administrative fields.

19. Idempotency

Order creation must use an idempotency key.

This protects against:

Repeated clicks.

Retries.

Slow connections.

Duplicate network requests.

Idempotency protects consistency but is not a general rate-limiting solution.

20. Concurrency

Critical quantity and lifecycle operations require concurrency-safe database logic.

Expected strategies include:

Transactions.

Row locking where necessary.

Conditional updates.

Database constraints.

Race-condition security and integrity tests must cover scenarios such as:

Two KITCHEN users updating the same remaining quantity.

Invalid final states must remain impossible.

21. Realtime Security

Realtime does not bypass authorization.

Subscriptions must correspond to resources users are allowed to read.

After authentication state changes:

Tokens must be refreshed appropriately.

Revoked access must not be assumed to disappear solely because UI navigation changed.

Interfaces must always be able to refetch authoritative state after reconnecting.

Realtime payloads must not contain information the subscriber could not otherwise read.

22. Secrets

Frontend code may contain only credentials explicitly designed to be public client credentials.

Privileged Supabase credentials must never be committed or shipped to the browser.

Examples of server-only secrets:

Supabase privileged secret/service credentials.

External API secrets.

Webhook signing secrets.

Email provider credentials.

WhatsApp provider credentials.

Server-only secrets belong in trusted runtime secret management.

23. Environment Variables

The repository provides:

.env.example

with variable names but no real secrets.

Actual .env files containing secrets must be ignored by Git.

Production secrets must not be copied into documentation, tests, screenshots, logs, or prompts.

24. Product Image Security

Product images are non-sensitive catalog content.

A public-readable Storage bucket may be used if approved.

Write access remains restricted.

Uploads must validate:

Authorized actor.

Expected file type.

Allowed size.

Safe object path.

User-provided filenames should not directly determine unrestricted object paths.

SVG or other active-content formats require additional review before being accepted.

25. XSS

React's default escaping must be preserved.

Avoid:

dangerouslySetInnerHTML

unless a specific reviewed requirement exists.

User-generated notes and descriptions must be rendered as text.

Rich HTML editing is outside MVP V1.

26. CSRF

The selected Supabase authentication mechanism and browser session behavior must be reviewed during implementation.

If future Edge Functions or cookie-authenticated endpoints introduce CSRF exposure, appropriate CSRF protections must be applied.

Security assumptions must not be copied blindly from a conventional Express application.

27. Error Handling

User-facing errors must:

Explain recoverable actions.

Avoid exposing internal implementation details.

Avoid exposing SQL.

Avoid exposing secrets.

Avoid exposing stack traces in production.

Logs may contain additional diagnostic context but must still exclude credentials and unnecessary personal information.

28. Logging and Audit

Operational audit records and application diagnostics are different concerns.

OrderEvent

Business auditability.

Technical Logging

Application diagnostics and security investigation.

Sensitive information must not be logged unnecessarily.

Never log:

Passwords.

Access tokens.

Refresh tokens.

Privileged keys.

29. Personal Data Minimization

Only collect information necessary for ordering operations.

Do not add personal fields merely because they may become useful later.

Business contact information requires a defined operational purpose.

Data retention requirements may be revisited before real production adoption.

30. Dependency Security

Dependencies require controlled introduction.

Rules:

Use pnpm.

Commit the lockfile.

Do not add libraries without justification.

Prefer actively maintained dependencies.

Review known vulnerabilities.

Remove unused dependencies.

Dependency updates must preserve tests and architecture.

Automated dependency security tooling may be enabled through GitHub.

31. Local Environment Security

Local Supabase exists for development and testing only.

It must not be exposed publicly as production infrastructure.

Development credentials are not production credentials.

Local seed accounts must use clearly non-production values.

32. Migration Security

Database security changes are versioned.

Do not apply undocumented production security fixes manually and leave migrations inconsistent.

Security changes include:

Grants.

RLS.

Policies.

Functions.

Trigger permissions.

Storage policies.

They belong in source-controlled migrations.

33. Testing Requirements

Security tests are mandatory.

At minimum:

Authentication

Anonymous access rejection.

Inactive user rejection where applicable.

Authorization

CUSTOMER isolation.

KITCHEN privilege boundaries.

MANAGER permissions.

Inactive Business restrictions.

Inactive Membership restrictions.

Database

RLS positive cases.

RLS negative cases.

Function EXECUTE permissions.

Constraint enforcement.

Business Operations

Invalid lifecycle transitions.

Excess quantity attempts.

Duplicate creation.

Unauthorized cancellation.

Unauthorized dispatch.

Unauthorized delivery confirmation.

34. OWASP Review

Security reviews must consider the current OWASP Top 10.

Particular focus for this application includes:

Broken Access Control.

Security Misconfiguration.

Software Supply Chain Failures.

Cryptographic Failures.

Injection.

Insecure Design.

Authentication Failures.

Software or Data Integrity Failures.

Logging and Alerting Failures.

Mishandling of Exceptional Conditions.

The security review must consider the application's actual architecture rather than mechanically completing a checklist.

35. Release Security Gate

Before the first public release and significant releases:

Run all automated tests.

Run database/RLS tests.

Run E2E authorization tests.

Review exposed environment variables.

Review RLS coverage.

Review database function permissions.

Review SECURITY DEFINER functions.

Review Storage policies.

Review dependency vulnerabilities.

Review production error handling.

Review authentication configuration.

Verify no secrets exist in Git history or build artifacts.

Review OWASP Top 10 exposure.

Review applicable ASVS controls.

Document unresolved risks.

Known critical or high-severity security defects must be resolved before public release unless a risk is explicitly evaluated and accepted through a documented decision.

36. Security Change Rule

Any implementation affecting:

Authentication.

Authorization.

RLS.

Roles.

Membership.

RPC privileges.

Storage policies.

Secrets.

Order ownership.

must explicitly include security testing.

No AI agent may silently weaken security policies to make a feature easier to implement.