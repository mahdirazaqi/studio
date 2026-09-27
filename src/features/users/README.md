# feature: users

**Scope:** User records, department membership, role, the `ACTIVE` / `DISABLED`
lifecycle, and Telegram-account linkage.

**Key rules** (`docs/domain/users.md`, ADR-0007): users are **never deleted** — "remove"
means disable. Every user belongs to exactly one Department and has one role
(`USER` / `MANAGER` / `ADMIN`).

**Status: implemented (Phase 2/3/8/10).** The `User` model exists
([`prisma/schema.prisma`](../../../prisma/schema.prisma), documented in
[`docs/architecture/database.md`](../../../docs/architecture/database.md)):

- `domain/user.ts` — pure domain types (`SafeUser`, `UserStatus`). No I/O.
- `repository/user-repository.ts` — `findUserCredentialByEmail` (the sign-in credential
  check — the only place `passwordHash` is read outside a migration/seed), plus the real
  management queries (Phase 10): `createUser`, `findUserInScope` (department-scoped,
  folds "doesn't exist" and "cross-department" into the same `null`), `listUsers`,
  `setUserStatus`, `setUserRole`.
- `use-cases/authorize-user-management.ts` (Phase 3) — the authorization _policy_ for
  create/change-role/disable-enable (escalation and self-modification protection,
  ADR-0023), now wired to real mutations: `create-user.ts`, `set-user-active-status.ts`,
  `change-user-role.ts`, `list-users.ts`.
- `actions/`, `schemas/`, `components/` (Phase 10) — the `/users` and `/users/new`
  dashboard pages: list (search, pagination, department column for ADMIN), create,
  disable/enable, and ADMIN-only role change.
- `use-cases/update-user-profile.ts` + `schemas/update-user-profile.schema.ts` +
  `actions/update-user-profile.action.ts` (Phase 20, ADR-0051) — `fullName`/`phone`
  editing, one write path shared by two pages: `/profile` (self-service, every role,
  identity-based, no capability check) and `/users/[userId]/edit` (MANAGER/ADMIN editing
  another user, `assertCanEditProfile` — same shape as `assertCanSetActiveStatus`).
  `role`/`departmentId`/`status`/`email` are structurally absent from this schema, never
  reachable through this path.
- Telegram-account linking (`phone`/`telegramUserId`, Phase 8) lives in
  `features/telegram/domain/phone.ts` and `features/telegram/use-cases/
link-telegram-account.ts` — this feature's `User` rows are the target, but the linking
  _mechanism_ is Telegram-feature scope. `phone`'s editing UI (Phase 20) reuses
  `normalizePhone` from that same module so a manually-entered number always normalizes
  identically to what Telegram linking expects.

See [`docs/domain/users.md`](../../../docs/domain/users.md) for the full field set and
permission rules.
