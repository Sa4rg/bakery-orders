# ADR-013 — Controlled Email and Password Authentication

Status: ACCEPTED

## Context

Bakery Orders is a controlled B2B ordering system. Private operational information requires authentication (BR-AUTH-002), roles are `CUSTOMER`, `KITCHEN`, and `MANAGER` (BR-AUTH-001), and public unrestricted self-registration is not supported in the MVP (BR-AUTH-008). Frontend route protection is not an authorization boundary (BR-AUTH-009).

ADR-001 selects Supabase as the backend platform, which includes Supabase Auth. ADR-003 selects PostgreSQL RLS as the primary authorization boundary. Existing documentation deliberately left two decisions open for MVP V1:

- The authentication method for external businesses (OPEN-004, US-AUTH-001).
- The customer onboarding workflow (US-AUTH-005).

The M1 database slice already provides `public.profiles`, `public.businesses`, and `public.business_memberships` protected by RLS and least-privilege grants. Frontend authentication (M1-005 and M1-006) cannot start without an accepted decision on the authentication method and onboarding model.

## Decision

### Authentication provider and method

- Authentication provider: Supabase Auth.
- Primary MVP authentication method: email and password.
- Public signup: disabled.
- Anonymous signup: disabled.
- Frontend signup page: none.
- Onboarding: controlled and trusted only.

CUSTOMER, KITCHEN, and MANAGER users must not be able to create their own application account, role, Profile, or BusinessMembership through a public browser signup flow.

Account provisioning is an administrative operation:

- During the initial demo and local-development phase, accounts may be provisioned through a trusted development/admin process.
- A future production-ready Manager onboarding workflow must execute through a trusted server-side boundary, such as a Supabase Edge Function or another approved backend/admin process.
- The browser must never receive or use a service-role/secret key.

### Authentication versus authorization

Authentication:

- Supabase Auth establishes who the user is.

Authorization:

- PostgreSQL grants, RLS, `public.profiles.role`, and `public.business_memberships` determine what the authenticated user may access.

A valid Supabase session alone does NOT imply application authorization. An authenticated identity may have:

- No Profile.
- An inactive Profile.
- A CUSTOMER Profile without an active BusinessMembership.

Each of these states must fail closed for protected application behavior.

### Session model

The browser application will use `@supabase/supabase-js` and rely on Supabase browser session persistence and authentication state change notifications.

M1-B will implement:

- Initial session restoration.
- Sign in with email and password.
- Authentication-state synchronization.
- Logout.
- Protected application shell.
- Profile resolution after authentication.
- CUSTOMER membership resolution.

Logout from the ordinary UI will explicitly use:

```ts
supabase.auth.signOut({ scope: 'local' })
```

so that signing out of one browser or device does not intentionally terminate all other sessions.

Authorization must still be enforced by RLS even when the frontend believes a session is valid.

### Local and hosted configuration

Public signup must be disabled in both development and hosted Supabase Auth configuration.

For local Supabase, the implementation must explicitly configure:

```text
auth.enable_signup = false
auth.enable_anonymous_sign_ins = false
```

and must evaluate the corresponding email-provider signup setting so that local configuration cannot accidentally expose an email signup path.

Hosted configuration must match the same product rule before any public demo or release.

This ADR does not change `supabase/config.toml`; configuration changes belong to the implementation task.

### Password recovery

Password recovery is NOT required in the first implementation slice of M1-B. This is a known limitation of the initial demo.

Before real operational adoption:

- Password recovery must be implemented and tested.
- Redirect URLs must be reviewed.
- A production-grade outbound email/SMTP configuration must be established.
- Account recovery must not weaken authorization or role assignment.

Local development may use Supabase Mailpit when email testing becomes necessary.

## Alternatives Considered

### 1. Magic Link / OTP as the primary login method

Rejected for the initial MVP. Every normal login would depend on reliable email delivery, which adds an avoidable external-email dependency for the demo. It may be reconsidered later.

### 2. Public email/password signup

Rejected. Bakery Orders is a controlled B2B system, and public users must not self-create identities that appear eligible for business access.

### 3. Social OAuth

Rejected for the MVP. It adds provider configuration and complexity without a demonstrated product requirement.

### 4. Custom password/authentication implementation

Rejected. Credential storage and authentication are delegated to Supabase Auth. The application must not implement custom password storage (see `docs/architecture/security.md`).

## Consequences

Benefits:

- Authentication is delegated to a maintained platform component.
- A single login method keeps the first implementation small and testable.
- Authentication and authorization remain separate concerns.
- No dependency on email delivery for ordinary sign-in.

Costs and limitations:

- Accounts must be provisioned by a trusted process; there is no self-service onboarding.
- A production-ready Manager onboarding workflow is deferred and requires a trusted server-side boundary.
- Password recovery is unavailable in the initial demo.
- The implementation adds a frontend dependency (`@supabase/supabase-js`) and Supabase Auth configuration changes, each requiring explicit approval in its own task.
- Users may hold a valid session while lacking application authorization, so the frontend must handle these states explicitly.

## Security Impact

- No service-role/secret key may appear in `VITE_*` variables, browser bundles, source code, tests, or logs.
- Publishable browser credentials are not authorization secrets; authorization never depends on them.
- Roles must not be taken from user-editable metadata (such as `user_metadata`) as the authorization source of truth.
- `public.profiles` and `public.business_memberships` remain the authoritative application authorization data, protected by RLS and grants.
- Omitting a signup UI is not a security defense by itself. Supabase Auth signup must actually be disabled in every environment.
- Invalid credentials must produce a generic user-facing authentication error and must not enable account enumeration.
- Inactive or incompletely provisioned identities must fail closed.
- Frontend role-based UI is a UX control, not evidence of backend authorization.
- Threats THR-004 (Role Escalation) and THR-005 (Membership Manipulation) remain mitigated by the existing RLS and grant model; this decision does not weaken them.

## Testing Impact

M1-B must test at minimum:

- Valid email/password sign-in.
- Invalid credentials.
- Initial session restoration.
- Sign-out.
- Signed-out users cannot enter protected application UI.
- An authenticated identity without a Profile is denied application access.
- An inactive Profile is denied protected application access.
- An active CUSTOMER without an active membership is denied customer access.
- A valid active CUSTOMER resolves an authorized membership.
- KITCHEN and MANAGER do not require customer memberships.
- Frontend role hiding is not treated as backend authorization evidence.

Existing pgTAP RLS tests remain authoritative for database isolation. Frontend tests prove user-interface behavior only.

## Migration / Rollback

This decision introduces no database migration by itself.

The implementation will add a frontend Supabase client dependency and Supabase Auth configuration changes.

Changing the authentication method later is possible because application authorization remains separated in Profile, BusinessMembership, and PostgreSQL rather than being encoded solely in the login method. A replacement method requires a superseding ADR and must preserve the existing Profile and BusinessMembership authorization model.
