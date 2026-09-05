# Database

**`DECIDED` — implemented in Phase 2.** PostgreSQL + Prisma (ADR-0002). This page
documents the actual setup; [`../data/database.md`](../data/database.md) documents the
full conceptual entity model (most of which is still future work) and
[`../development/database.md`](../development/database.md) is the day-to-day workflow
(commands, local setup, troubleshooting).

## What exists today

Only what Phase 2 needs: `Department`, `User`, `Session`. See
[`prisma/schema.prisma`](../../prisma/schema.prisma) for the source of truth — this page
explains the decisions behind it, not a copy of it.

## Client

- `src/server/db/index.ts` exports the single `PrismaClient` instance as `db`.
- Nothing else constructs a `PrismaClient` or imports `@prisma/client` directly — only
  feature repositories (`src/features/<feature>/repository/*.ts`) import `db`, per
  [project-structure.md](project-structure.md).
- `db` is cached on `globalThis` outside production. Next.js dev-mode hot reload
  re-evaluates modules on every change; without the cache, each reload would create a new
  `PrismaClient` (and a new connection pool) without closing the old one, exhausting
  Postgres connections within a few edits. Production has one long-lived process, so the
  cache is skipped there — a fresh module graph only happens once, at boot.
- `db` is imported with `import "server-only"` at the top of the module — the same
  guarantee as every other `src/server/*` module.

## Schema decisions

### Department

- Minimal: `id`, `name` (unique), `createdAt`, `updatedAt`. No `status`/`archived` field —
  Department deletion/archival is **OPEN DECISION OD-07**, and adding a half-used enum
  ahead of that decision would be speculative schema.
- **Integrity without a feature:** there is no Department-delete code path at all, and
  `User.departmentId` is a required foreign key with `onDelete: Restrict`. Postgres
  itself refuses to delete a Department that still has Users — even via a manual/ad-hoc
  query — satisfying CLAUDE.md's "must avoid making accidental deletion capable of
  silently destroying historical User relationships" without pre-deciding OD-07.

### User

- Fields: `id`, `email` (unique, login identifier), `fullName`, `passwordHash`, `role`
  (`UserRole` enum), `status` (`UserStatus` enum: `ACTIVE` | `DISABLED`), `departmentId`
  (required FK, `onDelete: Restrict`), `createdAt`, `updatedAt`.
- **`status`, not `isActive`** — matches [`../domain/users.md`](../domain/users.md) and
  ADR-0007's vocabulary (`ACTIVE`/`DISABLED`); avoids having both a boolean and a status
  field for the same concept.
- Deliberately **not yet present**: `phone`, `telegramUserId`, `disabledAt`,
  `disabledByUserId`. These belong to the Telegram-linking and user-management/disable
  features (later phases) — adding them now, with no code path that sets or reads them,
  would be speculative schema. See [`../domain/users.md`](../domain/users.md) for the full
  future field list.
- **ADMIN still has a `departmentId`** (required, like every other role) — this Phase 2
  schema resolves the "does ADMIN need a home department" question in
  [`../domain/users.md`](../domain/users.md) in favor of "yes, every user has exactly one
  Department" (CLAUDE.md §5), keeping the model uniform. Whether ADMIN's department has
  any special meaning beyond "home" remains open.
- **Indexes:** `email` (via the unique constraint) for login lookup; `departmentId` for
  the department-scoped queries later phases add (ADR-0011). No `role` index — 3 possible
  values isn't selective enough on its own; a composite `(departmentId, role)` index can
  be added when a real query needs it.

### Session

See [authentication.md](authentication.md) for the full mechanism. Schema-wise: `id`,
`tokenHash` (unique — the cookie's raw token, hashed, never the token itself),
`userId` (FK, `onDelete: Cascade`), `expiresAt`, `createdAt`. Indexed on `userId` (future
"list/revoke my sessions" style features) and uniquely on `tokenHash` (the lookup path on
every request).

## Migrations

- `prisma/migrations/` is committed. `20260905071648_init` is the Phase 2 migration
  (Department, User, Session, both enums).
- **Local development:** `npm run db:migrate` (`prisma migrate dev`) — creates a new
  migration from schema changes and applies it to the local database.
- **Deployment:** `npm run db:migrate:deploy` (`prisma migrate deploy`) — applies
  committed migrations without generating new ones or prompting; this is what CI/CD runs
  against a real environment. Never run `migrate dev` against a shared/production
  database.
- No migration may hard-delete a Job or hard-delete a Template (not relevant yet — those
  models don't exist — but the rule from
  [`../development/conventions.md`](../development/conventions.md) §7 stands for every
  future migration).
- `prisma.config.ts` (not `package.json#prisma`, which Prisma 7 removes) configures the
  schema path and the seed command. It loads `.env` itself (via `process.loadEnvFile`)
  because a `prisma.config.ts` file switches the Prisma CLI to config-based env loading —
  see the comments in that file.

## Seeding

`prisma/seed.ts`, run via `npm run db:seed` (or automatically after `prisma migrate dev`
unless `--skip-seed` is passed). Creates:

- one Department (`SEED_DEPARTMENT_NAME`, default `"Development"`)
- one `ADMIN` user in it, **only if** `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set

Both are read through `@/server/env` (never `process.env` directly, per CLAUDE.md §5) and
are optional — an environment with neither set gets the Department only, no admin
account. There is no production seed: production Departments/Users are created through
the application once user management exists (a later phase).

The seed command runs as `node --conditions=react-server --import tsx prisma/seed.ts`
(configured in `prisma.config.ts`) rather than plain `tsx`. The seed script imports
`@/server/env` and `@/server/auth/password`, both of which start with `import
"server-only"` — a marker that **throws** outside Next.js's own build, which resolves it
to a no-op via webpack's `react-server` condition. Passing that same condition to plain
Node makes the marker resolve to its no-op export there too, so the seed script can reuse
those modules unmodified instead of duplicating env/hashing logic.

## Local development database

The application needs a real PostgreSQL instance reachable via `DATABASE_URL`. Any
Postgres 14+ works; the simplest local option is a disposable container:

```bash
docker run -d --name studio-postgres \
  -e POSTGRES_USER=studio \
  -e POSTGRES_PASSWORD=studio_dev_password \
  -e POSTGRES_DB=studio \
  -p 5433:5432 \
  postgres:16-alpine
```

(Port `5433`, not the Postgres default `5432`, only to avoid colliding with another local
Postgres you might already have running — adjust freely.) Then set `DATABASE_URL` in
`.env` to match (see `.env.example`), run `npm run db:migrate`, and optionally
`npm run db:seed`.

## Verified

This schema and workflow were validated against a real PostgreSQL 16 instance as part of
Phase 2: `prisma validate`, `prisma migrate dev` (applies cleanly, foreign keys and
indexes match the schema), `prisma migrate status` (clean), and the seed script (creates
the Department + admin user idempotently). See
[authentication.md](authentication.md#verification) for the authentication-scenario
verification, which also exercises this database end-to-end.
