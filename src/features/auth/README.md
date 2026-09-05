# feature: auth

**Scope:** establishing _who_ the caller is — session lifecycle for humans, and the
sign-in / sign-out flow. Identity only; it does not decide _what_ a caller may do (that
is `@/server/authz`).

**Boundary already in place:** `@/server/auth/current-user` (`getCurrentUser`,
`requireUser`). This feature will implement the session backend behind it.

**Not built yet.** Session mechanism is OPEN DECISION OD-43. See
`docs/architecture/authentication-boundary.md` and `docs/domain/users.md`.

Will contain: `actions/` (sign-in, sign-out), `use-cases/` (verify credentials, issue
session), `schemas/`, `server/` (cookie/session helpers), `components/` (sign-in form).
