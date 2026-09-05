# Database Workflow

Day-to-day commands for working with the database locally. For the schema decisions and
rationale, see [`../architecture/database.md`](../architecture/database.md); for the
conceptual entity model, [`../data/database.md`](../data/database.md).

## First-time local setup

1. Start a local Postgres. The simplest option is a disposable container:

   ```bash
   docker run -d --name studio-postgres \
     -e POSTGRES_USER=studio \
     -e POSTGRES_PASSWORD=studio_dev_password \
     -e POSTGRES_DB=studio \
     -p 5433:5432 \
     postgres:16-alpine
   ```

2. `cp .env.example .env` and set `DATABASE_URL` to match (the example already points at
   the container above).
3. `npm run db:migrate` — applies the committed migrations to your database.
4. `npm run db:seed` — creates the development Department, and an `ADMIN` user if
   `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` are set in `.env`.
5. `npm run dev` and sign in with the seeded admin.

## Commands

| Command                     | Runs                    | When                                                                                                                                                                                 |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run db:generate`       | `prisma generate`       | After pulling schema changes (also runs automatically on `npm install`).                                                                                                             |
| `npm run db:migrate`        | `prisma migrate dev`    | After editing `prisma/schema.prisma`, in local development. Prompts for a migration name and applies it immediately.                                                                 |
| `npm run db:migrate:deploy` | `prisma migrate deploy` | In CI/CD, against a real environment. Applies committed migrations only — never generates a new one, never prompts. **Never run `db:migrate` against a shared/production database.** |
| `npm run db:seed`           | `prisma db seed`        | Whenever you want the dev Department/admin (re)created. Idempotent (`upsert`) — safe to run repeatedly.                                                                              |
| `npm run db:studio`         | `prisma studio`         | A local GUI to browse/edit the database — development only.                                                                                                                          |

## Changing the schema

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate` — name the migration descriptively (e.g. `add_template_status`).
3. Commit the generated `prisma/migrations/<timestamp>_<name>/` directory — migrations are
   part of the change, not a local artifact.
4. Update [`../architecture/database.md`](../architecture/database.md) (and the relevant
   `domain/*.md` page) to describe the new shape and why.
5. If the change resolves or touches an `OPEN DECISION`, update
   [`open-decisions.md`](open-decisions.md) and, if it's a real architectural decision,
   add an ADR to [`../architecture/decisions.md`](../architecture/decisions.md).

## Troubleshooting

- **"Environment variable not found: DATABASE_URL"** running a bare `npx prisma ...`
  command — `prisma.config.ts` loads `.env` itself; make sure one exists at the repo root
  (`cp .env.example .env` if not). A `prisma.config.ts` file switches the Prisma CLI away
  from its old built-in `.env` auto-load, which is why this project loads it explicitly in
  that file.
- **Seed script throws `"This module cannot be imported from a Client Component
module"`** — the seed command must run with `--conditions=react-server` (already
  configured in `prisma.config.ts`'s `migrations.seed`); running `prisma/seed.ts` with a
  bare `tsx prisma/seed.ts` skips that condition and `import "server-only"` (in
  `@/server/env`, `@/server/auth/password`) throws, exactly as it's designed to outside a
  React Server Component. Use `npm run db:seed`, not `tsx` directly.
- **Connections exhausted after many hot reloads in `npm run dev`** — shouldn't happen;
  `src/server/db/index.ts` caches the `PrismaClient` on `globalThis` outside production for
  exactly this reason. If it does, check that nothing else constructs a `new
PrismaClient()` — only that one file should.
