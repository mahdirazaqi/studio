# feature: auth

**Scope:** establishing _who_ the caller is — session lifecycle for humans, and the
sign-in / sign-out flow. Identity only; it does not decide _what_ a caller may do (that
is `@/server/authz`).

**Status: implemented (Phase 2).** See
[`docs/architecture/authentication.md`](../../../docs/architecture/authentication.md)
(ADR-0020) for the full mechanism and
[`docs/architecture/authentication-boundary.md`](../../../docs/architecture/authentication-boundary.md)
for the boundary contract this feature implements.

## Contents

- `schemas/sign-in.schema.ts` — the one Zod schema, shared by the Server Action
  (authoritative) and the sign-in form (UX only).
- `use-cases/sign-in.ts` — verify credentials, issue a session. A single generic failure
  for unknown email / wrong password / disabled account.
- `use-cases/sign-out.ts` — end a session by its token.
- `actions/sign-in.action.ts`, `actions/sign-out.action.ts` — `defineAction` wrappers;
  these are the only places that write/clear the session cookie (via
  `@/server/auth/session`), since use cases never import `next/*` request APIs.
- `components/sign-in-form.tsx`, `components/sign-out-button.tsx` — the only Client
  Components in this feature.

The session mechanism itself (`@/server/auth/session`), password hashing
(`@/server/auth/password`), and the `getCurrentUser()`/`requireUser()` boundary
(`@/server/auth/current-user`) live under `src/server/auth`, not here — they are
infrastructure other `server/*` modules and use cases depend on, not feature business
logic. This feature only orchestrates them for the login/logout flow.

**Not built yet:** password reset, "remember me" / session listing, rate limiting on
login (OPEN DECISION OD-41), Telegram identity linking.
