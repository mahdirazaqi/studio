# Authentication Boundary

Authentication (the session backend) is implemented in a later phase. Phase 1 establishes
the **boundary** so feature code can be written against it now.

## Where things live

| Concern                       | Location                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Resolve the current principal | `@/server/auth/current-user` — `getCurrentUser()`, `requireUser()`                   |
| The `CurrentUser` shape       | `@/server/auth/current-user` (`id`, `role`, `departmentId`, `displayName`, `email`)  |
| Role vocabulary (client-safe) | `@/lib/roles` (`Role`, `ROLE_RANK`, `hasAtLeastRole`)                                |
| Authorization decisions       | `@/server/authz` — **not** here (see [authorization.md](../domain/authorization.md)) |
| Auth errors                   | `unauthenticatedError()` → `401`, mapped by the action/route helpers                 |

## Phase 1 behavior

- `getCurrentUser()` **always returns `null`** — there is no session backend yet. This is
  an honest boundary, not a fake user.
- `requireUser()` therefore throws `unauthenticated`. Any Server Action with
  `auth: "required"` (the default) will return `{ ok: false, error: { kind:
"unauthenticated" }}` until auth lands.
- The dashboard shell renders (so the layout is verifiable) but shows "Not signed in" in
  the sidebar footer.
- `getCurrentUser` is wrapped in React `cache()` so it de-dupes within a request.

## What must NOT happen

- No fabricated user, no hard-coded role, no fake login flow.
- Auth state is read **only** through this module. Nothing else touches cookies/sessions.
- Route/page protection is enforced in the page/use case, not by hiding UI.

## When the session backend is added (later phase)

1. Pick the mechanism (OPEN DECISION **OD-43**).
2. Implement it inside `src/features/auth` behind `getCurrentUser()`.
3. Add `SESSION_SECRET` (and friends) to `src/server/env.ts` as **required**.
4. Add middleware or per-segment checks to redirect unauthenticated users to `/sign-in`.
5. Nothing else in the codebase should need to change — every caller already uses
   `getCurrentUser()` / `requireUser()`.
