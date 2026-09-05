# feature: users

**Scope:** User records, department membership, role, the `ACTIVE` / `DISABLED`
lifecycle, and Telegram-account linkage.

**Key rules** (`docs/domain/users.md`, ADR-0007): users are **never deleted** — "remove"
means disable. Every user belongs to exactly one Department and has one role
(`USER` / `MANAGER` / `ADMIN`).

**Status: partial (Phase 2).** The `User` model exists
([`prisma/schema.prisma`](../../../prisma/schema.prisma), documented in
[`docs/architecture/database.md`](../../../docs/architecture/database.md)), but this
feature folder only has what the `auth` feature needs to authenticate a login:

- `domain/user.ts` — pure domain types (`SafeUser`, `UserStatus`). No I/O.
- `repository/user-repository.ts` — `findUserCredentialByEmail`, the one query the sign-in
  use case needs. It is the only place `passwordHash` is read outside a migration/seed —
  callers other than `features/auth` should never need it and should not add a new call
  site that returns it.

**Not built yet:** user creation, disable/re-enable, role change, listing, Telegram
linking — the full CRUD/management surface. This is a later phase; the repository grows
with it (see `docs/domain/users.md` for the target field set and permission rules).
