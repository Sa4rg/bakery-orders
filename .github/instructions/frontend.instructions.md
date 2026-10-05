
---
applyTo: "src/**/*.{ts,tsx}"
---

# Frontend Instructions — Bakery Orders

## 1. Architecture

Use feature-based architecture.

Primary boundaries:

```text
src/app/
src/features/
src/shared/
src/lib/
```

Feature-local behavior belongs inside the owning feature.

Move something to `shared/` only when genuinely reusable across independent features.

Never make `shared/` depend on a feature.

---

## 2. Feature Structure

Use additional layers only when complexity justifies them.

Example:

```text
features/orders/
├── domain/
├── application/
├── data/
├── components/
└── pages/
```

Do not create empty folders or interfaces for architectural appearance.

---

## 3. Components

Components should primarily handle:

- Rendering.
- Interaction.
- Accessibility.
- Presentation state.

Avoid components that simultaneously:

- Fetch unrelated data.
- Perform multiple mutations.
- Contain major business calculations.
- Handle authentication.
- Control unrelated UI flows.

Extract responsibilities when they have independent reasons to change.

---

## 4. Hooks

Hooks should represent cohesive application behavior.

Examples:

```text
useOrderTracking()
useCreateOrder()
useCatalog()
```

Avoid general-purpose hooks with unrelated responsibilities.

Do not hide excessive application logic inside a hook merely to make a component shorter.

---

## 5. Domain Logic

Prefer pure functions for domain calculations when practical.

Examples:

```text
calculateRemainingQuantity()
deriveFulfillmentCondition()
canTransitionOrder()
```

Do not embed critical calculations repeatedly in JSX.

---

## 6. Forms

Use:

```text
React Hook Form
Zod
```

Zod provides runtime validation for frontend input.

Do not assume Zod protects the backend from manipulated requests.

All critical business rules must remain enforced by trusted backend logic.

---

## 7. TypeScript

Use strict TypeScript.

Avoid:

```text
any
```

unless there is an exceptional documented reason.

Prefer:

- Explicit domain types.
- Generated database types at infrastructure boundaries.
- Narrow types.
- Exhaustive handling where appropriate.

Do not make all fields optional merely to silence type errors.

---

## 8. Supabase Access

Do not scatter Supabase calls throughout React components.

Prefer feature-local data functions.

Example:

```text
features/orders/data/getOrders.ts
features/orders/data/createOrder.ts
```

Critical mutations call approved RPC functions.

Do not directly update protected order state from browser code.

---

## 9. Data Mapping

Generated Supabase database types represent database contracts.

They do not necessarily represent ideal domain/UI types.

Map when doing so improves:

- Domain clarity.
- Naming.
- Safety.
- Separation of infrastructure concerns.

Avoid unnecessary mapping when it provides no value.

---

## 10. Loading & Error States

Important data-driven UI must intentionally handle:

- Loading.
- Empty.
- Error.
- Success.

Do not render misleading empty data while a request is still loading.

Do not show success before persistence is confirmed.

---

## 11. Authorization UI

Role-based UI may hide unavailable actions for usability.

However:

```text
Hidden control ≠ authorization
```

Never rely on frontend role checks as the only permission boundary.

---

## 12. Realtime

Realtime listeners should synchronize persisted state.

They must not independently execute business decisions.

On reconnect, prefer a strategy capable of refetching current data.

Prevent duplicate subscriptions and clean them up correctly.

---

## 13. Cart

The MVP cart is client-side.

Do not introduce persistent cart infrastructure without an accepted architecture change.

Repeat Order creates a new editable cart.

It must never automatically submit a historical order.

---

## 14. Accessibility

Use semantic elements.

Prefer:

```text
button
label
input
nav
main
section
```

over generic clickable containers.

Every input requires an accessible label.

Interactive controls require clear accessible names.

Status must not rely solely on visual color.

---

## 15. Responsive Design

CUSTOMER experience is mobile-first.

KITCHEN must work on realistic operational screens.

MANAGER should work well on tablet/desktop while remaining responsive.

Avoid fixed dimensions that break normal mobile layouts.

---

## 16. Testing

Use React Testing Library from the user's perspective.

Prefer queries by:

- Role.
- Label.
- Accessible name.
- User-visible text.

Avoid testing:

- Private component state.
- CSS implementation details.
- Internal function calls unless that function is itself the unit under test.

Use `user-event` for realistic interaction.

---

## 17. Single Responsibility

Before adding behavior to a component or hook, ask:

> Does this belong to the same responsibility and reason to change?

If not, separate it.

Do not split cohesive behavior merely because a file exceeds an arbitrary number of lines.

---

## 18. Styling

Do not introduce or replace the styling solution without explicit approval.

Do not add a UI framework merely for convenience.

Follow the styling decision established during project foundation.

---

## 19. Security

Do not render unsanitized arbitrary HTML.

Avoid `dangerouslySetInnerHTML` unless explicitly reviewed.

Never expose server-only secrets in frontend environment variables.

Assume every browser request can be manipulated.

---

## 20. Completion

Frontend changes should report:

- Components/hooks/data functions modified.
- Tests added or updated.
- Accessibility considerations.
- Error/loading behavior.
- Commands actually executed.