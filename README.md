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
  protected dashboard.
- **Phase 3** — authorization & department isolation — **complete**. A real capability
  registry (role floor per capability + department scope), `/users` (MANAGER+) and
  `/departments` (ADMIN) protected server-side, and a role-escalation/self-modification
  policy prepared for the future user-management feature.
- **Phase 4** — File Gallery & storage lifecycle — **complete**. Upload/browse/search/
  preview/delete for department-scoped media assets, a swappable storage adapter (local
  disk today), real content-type sniffing, and the historical-integrity contract future
  Job/Template features must follow.
- **Phase 5** — Template management — **complete**. Create/list/search/filter/edit/
  enable-disable/soft-delete for department-scoped render recipes, an asset-slot editor
  with an optional Gallery File default per slot (department-verified, deletion-protected),
  and the documented (not yet enforceable) Template/Job contract for Phase 6.
- **Phase 6** — Job management & state machine — **complete**. Job creation with an
  immutable historical snapshot (Template config as JSONB + resolved asset values as
  relational rows), an explicit validated state machine, an atomic (race-free) Worker
  claim, non-destructive retry, and a concurrency-safe daily upload quota — plus a
  create/list/detail/cancel/retry UI.
- **Phase 7** — Worker REST API — **complete**. `/api/worker/v1/jobs/{next,:id,:id/state,
:id/progress,:id/duration}`, thin adapters over Phase 6's use cases; a single shared,
  required `WORKER_API_KEY` compared with a timing-safe check (no database model, no
  per-Worker identity — a deliberate simplification); `/api/files/[fileId]` extended so
  the Worker can download input Files with the same credential.
- **Phase 8** — Telegram Bot integration — **complete**. A webhook-based bot (`telegraf`,
  `POST /api/telegram/webhook`) reusing every Job/Template/File application service
  unmodified — phone-based identity linking (`User.phone`/`User.telegramUserId`, both new
  unique columns), durable and lazily-TTL'd conversation state (`TelegramWizardState`,
  atomic-conditional-update safe against duplicate updates), Single Track / Album (a
  redesign onto Studio's typed Template model) / List / Retry / Cancel / a
  department-scoped Cancel All (fixing a real legacy system-wide-cancel authorization
  bug). No user/department management UI, no result/output upload, no YouTube yet.
- **Phase 9** — Media processing & delivery — **complete**. `POST
/api/worker/v1/jobs/:id/result` accepts the Worker's rendered result (raw bytes,
  idempotent against duplicates/races); `ffmpeg`-only screenshot/thumbnail generation
  (no ImageMagick) creates the first real `JOB_ARTIFACT` Files; a synchronous, awaited
  Delivery Orchestrator drives `RENDERED -> DELIVERING -> UPLOADED`/`ERROR`, recording
  durable per-provider `DeliveryAttempt` rows and sending best-effort Telegram
  notifications; `YouTubeTarget` (department-scoped, encrypted tokens) connects via a
  verified refresh-token entry rather than a full OAuth flow; a delivery-only retry and
  an idempotent artifact-cleanup primitive complete the pipeline. Still no
  user/department management UI.

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
├── app/          App Router — (auth) + (dashboard) route groups, /api/health,
│                 /api/files/[fileId] (session- or Worker-authenticated binary delivery),
│                 /api/worker/v1/jobs/{next,[jobId],[jobId]/state,progress,duration,result},
│                 /api/telegram/webhook (Telegram webhook, Phase 8)
├── features/     one folder per module — auth (Phase 2), users (Phase 2/3, partial),
│                 files (Phase 4), templates (Phase 5), jobs (Phase 6/7), telegram
│                 (Phase 8), youtube (Phase 9, YouTubeTarget CRUD + adapter), delivery
│                 (Phase 9, DeliveryAttempt + orchestration) implemented; departments
│                 (partial, Phase 4/5)
├── components/   ui/ (shadcn), theme/, layout/ (sidebar, header, shells, forbidden page)
├── lib/          client-safe utilities (cn, roles, navigation, site-config)
├── server/       server-only: env, logger, errors, validation, actions, api,
│                 auth (session/password/current-user), authz (capability registry),
│                 worker-auth (Worker Bearer-key check, Phase 7),
│                 telegram-webhook-auth (Telegram secret-token check, Phase 8), db,
│                 adapters/storage (StorageAdapter, local disk),
│                 adapters/telegram (Telegraf singleton, Phase 8),
│                 adapters/media (ffmpeg, Phase 9),
│                 adapters/youtube (googleapis client + token cipher, Phase 9), media (probe)
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
│   ├── authorization.md           Capability registry, department scope (ADR-0022/0023)
│   ├── database.md                Prisma client, schema decisions, migrations
│   ├── files.md                   Storage adapter, upload/deletion lifecycle (ADR-0024/0025/0026)
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
    ├── authorization.md           How to add a new authorized operation
    └── open-decisions.md          OPEN DECISION register
```
