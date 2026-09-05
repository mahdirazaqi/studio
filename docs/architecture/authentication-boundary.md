# Authentication Boundary

**`DECIDED` — the session backend behind this boundary is implemented as of Phase 2.**
Phase 1 established the boundary so feature code could be written against it before the
backend existed; this page now also reflects that the backend is real. See
[authentication.md](authentication.md) for the concrete mechanism (ADR-0020) and
[../domain/users.md](../domain/users.md) / [../data/database.md](../data/database.md) for
the `User`/`Session` schema behind it.

## Where things live

| Concern                       | Location                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Resolve the current principal | `@/server/auth/current-user` — `getCurrentUser()`, `requireUser()`                              |
| The `CurrentUser` shape       | `@/server/auth/current-user` (`id`, `role`, `departmentId`, `displayName`, `email`)             |
| Session mechanism             | `@/server/auth/session` — cookie + `Session` table (see [authentication.md](authentication.md)) |
| Password hashing              | `@/server/auth/password` — bcrypt (`bcryptjs`)                                                  |
| Sign-in / sign-out            | `src/features/auth` — schemas, use cases, Server Actions, components                            |
| Role vocabulary (client-safe) | `@/lib/roles` (`Role`, `ROLE_RANK`, `hasAtLeastRole`)                                           |
| Authorization decisions       | `@/server/authz` — **not** here (see [authorization.md](../domain/authorization.md))            |
| Auth errors                   | `unauthenticatedError()` → `401`, mapped by the action/route helpers                            |

## Current behavior (Phase 2)

- `getCurrentUser()` resolves the session cookie against the `Session`/`User` tables and
  returns the real `CurrentUser`, or `null` for anything invalid: no cookie, an
  unknown/expired token, or a session whose `User.status` is no longer `ACTIVE`. It is
  **not** a fake user, and it was never one — Phase 1's `null` was an honest "not built
  yet," not a stand-in.
- `requireUser()` throws `unauthenticated` when there is no valid session, exactly as
  before — every Server Action with `auth: "required"` (the default) still returns
  `{ ok: false, error: { kind: "unauthenticated" } }` for a signed-out caller.
- `src/app/(dashboard)/layout.tsx` calls `getCurrentUser()` directly and redirects to
  `/sign-in` on `null` — this is the one place route-group protection is enforced; pages
  underneath it do not repeat the check.
- The sidebar footer shows the real signed-in user (name, email, role) and a working
  **Sign out** action, replacing Phase 1's disabled "Not signed in" placeholder.
- `getCurrentUser` is still wrapped in React `cache()` so it de-dupes within a request
  (one session lookup per request, not one per call site).

## What must NOT happen

- No fabricated user, no hard-coded role, no bypassing the cookie/DB lookup.
- Auth state is read **only** through `@/server/auth/*`. Nothing else touches
  cookies/sessions directly — not even other `@/server/*` modules.
- Route/page protection is enforced in the page/layout/use case, not by hiding UI.
- Phase 3 (full authorization) builds on this boundary without changing its shape — the
  `Actor` a use case receives (`userId`, `role`, `departmentId`) is already backed by a
  real, disable-aware session.
