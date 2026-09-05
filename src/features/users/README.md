# feature: users

**Scope:** User records, department membership, role, the `ACTIVE` / `DISABLED`
lifecycle, and Telegram-account linkage.

**Key rules** (`docs/domain/users.md`, ADR-0007): users are **never deleted** — "remove"
means disable. Every user belongs to exactly one Department and has one role
(`USER` / `MANAGER` / `ADMIN`).

**Not built yet.** Depends on the database layer (ADR-0002) and the auth feature.

Will contain: `use-cases/` (create, disable, re-enable, change role, link Telegram),
`actions/`, `schemas/`, `repository/`, `read/`, `domain/` (User type, status), `components/`.
