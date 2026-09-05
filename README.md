# Studio

Standalone **Next.js (App Router, TypeScript)** application for operating a
video-rendering job pipeline: reusable **Templates**, concrete **Jobs**, an external
**Render Worker** (REST), **YouTube** / **Telegram** delivery, a **Telegram Bot**
front-end, and a reusable **File Gallery**.

Studio replaces the `src/render` module of the legacy backend `qtical-backend-node`. It
is a rewrite on a new architecture (PostgreSQL + Prisma, Server Actions, department-scoped
authorization), **not** a port.

## Status

- **Phase 0** — documentation & architecture foundation — **complete**.
- **Phase 1** — Next.js foundation & application skeleton — **complete**.
- **Phase 2** — database & authentication — **complete**. PostgreSQL + Prisma, a real
  DB-backed session mechanism, bcrypt password hashing, sign-in/sign-out, and a genuinely
  protected dashboard. No full authorization matrix, no user/department management UI, no
  domain features (Jobs/Templates/Files/Worker/Telegram/YouTube) yet.

## Getting started

```bash
npm install                # Node >= 20.9, npm >= 10
cp .env.example .env       # set DATABASE_URL to a real local PostgreSQL — see below
npm run db:migrate         # apply database migrations
npm run db:seed            # optional: seed a dev Department (+ ADMIN if configured)
npm run dev                # http://localhost:3000
```

Need a local Postgres? See [`docs/development/database.md`](docs/development/database.md)
for a one-command disposable container and the full migration/seed workflow.

| Command                                                                  | What                                      |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| `npm run dev` / `npm run build` / `npm run start`                        | dev / production build / serve            |
| `npm run lint` · `npm run typecheck` · `npm run format` · `npm run test` | individual checks                         |
| `npm run check`                                                          | all of the above — run before every PR    |
| `npm run db:migrate` / `npm run db:seed` / `npm run db:studio`           | Prisma migrate / seed / local GUI browser |

Environment: copy `.env.example` to `.env`. `DATABASE_URL` is required as of Phase 2; a
missing **required** variable fails startup with a clear message.

## Stack

Next.js 15 · React 19 · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui · next-themes ·
Zod · Vitest · ESLint 9 · Prettier · npm · **PostgreSQL + Prisma** · **bcrypt**. See
[`docs/architecture/tech-stack.md`](docs/architecture/tech-stack.md).

## Project layout

```
prisma/         schema.prisma, migrations/, seed.ts
src/
├── app/          App Router — (auth) + (dashboard) route groups, /api/health
├── features/     one folder per module — auth & users (implemented, Phase 2),
│                 departments, jobs, templates, files, telegram (README only, no impl yet)
├── components/   ui/ (shadcn), theme/, layout/ (sidebar, header, shells)
├── lib/          client-safe utilities (cn, roles, navigation, site-config)
├── server/       server-only: env, logger, errors, validation, actions, api,
│                 auth (session/password/current-user), authz boundary, db (Prisma client)
└── types/        cross-cutting client-safe types
```

## Start here

- **AI agents / Claude Code:** read [`CLAUDE.md`](CLAUDE.md) first.
- **Humans:** read [`docs/README.md`](docs/README.md).

## Documentation map

```
docs/
├── README.md                     Documentation index
├── glossary.md                   Shared vocabulary
├── architecture/
│   ├── overview.md                System shape, layers, modules
│   ├── boundaries.md              Server Actions vs REST vs Telegram
│   ├── project-structure.md       Actual folder layout & layer responsibilities
│   ├── tech-stack.md              Technologies, versions & rationale
│   ├── server-actions.md          defineAction convention
│   ├── rest-architecture.md       defineRouteHandler convention
│   ├── server-client-boundary.md  Server vs Client Components
│   ├── authentication-boundary.md Where the current user is resolved
│   ├── authentication.md          Session mechanism, login/logout flow (ADR-0020)
│   ├── database.md                Prisma client, schema decisions, migrations
│   ├── error-handling.md          AppError model & error boundaries
│   ├── environment.md             Validated env configuration
│   ├── logging.md                 Structured logging & redaction
│   ├── data-flow.md               End-to-end flows (create → render → deliver)
│   └── decisions.md               Architecture Decision Records (ADRs)
├── domain/
│   ├── users.md   departments.md   files.md   templates.md   jobs.md
│   └── authorization.md           Roles & permission matrix
├── data/
│   ├── database.md                PostgreSQL + Prisma entities
│   ├── lifecycle-rules.md         Deletion / retention per entity
│   └── historical-integrity.md    Snapshots & immutable references
├── integrations/
│   ├── worker-api.md              Render Worker REST contract
│   ├── telegram.md                Telegram bot integration
│   └── youtube.md                 YouTube upload integration
├── security/security.md           Security requirements
├── legacy/
│   ├── overview.md                What the legacy system did
│   ├── render-module.md           Reading guide to the analysis + source
│   ├── render-module-analysis.md  Full technical analysis of legacy src/render
│   ├── known-issues.md            Legacy problems Studio must not reproduce
│   ├── legacy-vs-studio.md        Concept mapping table
│   └── compatibility-matrix.md    Behavior-by-behavior compatibility decisions
├── frontend/
│   ├── conventions.md             UI conventions
│   └── theme.md                   Light / Dark / System theme system
└── development/
    ├── conventions.md             Coding conventions
    ├── workflow.md                Phases & dev workflow
    ├── database.md                Local setup, migrate/seed commands, troubleshooting
    └── open-decisions.md          OPEN DECISION register
```
