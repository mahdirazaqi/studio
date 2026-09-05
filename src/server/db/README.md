# Database boundary (`src/server/db`)

**Not implemented in Phase 1.** PostgreSQL + Prisma is introduced in the phase that
builds the first persistent feature (see `docs/data/database.md` and ADR-0002).

## The intended shape

- A single Prisma client instance is exported from `src/server/db/index.ts`
  (`import { db } from "@/server/db"`). Nothing else instantiates `PrismaClient`.
- Repositories live **per feature** (`src/features/<feature>/repository/*.ts`) and are
  the **only** modules that import `db`.
- Use cases call repositories, never `db` directly.
- Repositories apply department-scope filters defensively (see
  `docs/domain/authorization.md`).
- Multi-step writes run inside `db.$transaction(...)`.
- The Job-claim query uses `SELECT ... FOR UPDATE SKIP LOCKED` (raw query).

## Why nothing is here yet

Phase 1 is the application skeleton. Creating speculative Prisma models now would violate
the "no premature implementation" rule. When the Users/Departments feature starts:

1. `npm install -D prisma` + `npm install @prisma/client`
2. `prisma/schema.prisma` with only the models that feature needs
3. `src/server/db/index.ts` exporting the singleton client
4. `DATABASE_URL` added to `src/server/env.ts` as a **required** server variable
