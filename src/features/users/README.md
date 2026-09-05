# feature: users

**Scope:** User records, department membership, role, the `ACTIVE` / `DISABLED`
lifecycle, and Telegram-account linkage.

**Key rules** (`docs/domain/users.md`, ADR-0007): users are **never deleted** — "remove"
means disable. Every user belongs to exactly one Department and has one role
(`USER` / `MANAGER` / `ADMIN`).

**Status: partial (Phase 2/3).** The `User` model exists
([`prisma/schema.prisma`](../../../prisma/schema.prisma), documented in
[`docs/architecture/database.md`](../../../docs/architecture/database.md)):

- `domain/user.ts` — pure domain types (`SafeUser`, `UserStatus`). No I/O.
- `repository/user-repository.ts` — `findUserCredentialByEmail`, the one query the sign-in
  use case needs. It is the only place `passwordHash` is read outside a migration/seed —
  callers other than `features/auth` should never need it and should not add a new call
  site that returns it.
- `use-cases/authorize-user-management.ts` (Phase 3) — the authorization _policy_ for
  create/change-role/disable-enable (escalation and self-modification protection,
  ADR-0023), fully unit-tested, but **not wired to any repository write, Server Action, or
  page yet** — there is no user-management UI or mutation in this phase. See
  [`docs/architecture/authorization.md`](../../../docs/architecture/authorization.md).

**Not built yet:** the actual create/disable/role-change **use cases** and repository
writes, listing, Telegram linking — the full CRUD/management surface. This is a later
phase; it wires the already-implemented policy above to real mutations (see
`docs/domain/users.md` for the target field set and permission rules).
