# Project Structure

**`DECIDED`** in principle (feature-based, layered). Exact file names will settle during
Phase 1; this page defines the shape and the responsibility of each layer.

## 1. Top-level layout

```
studio/
├── CLAUDE.md
├── README.md
├── docs/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
├── src/
│   ├── app/                      # Next.js App Router — presentation only
│   │   ├── (auth)/               # sign-in etc. (no landing page)
│   │   ├── (dashboard)/          # the panel; every route requires a session
│   │   │   ├── jobs/
│   │   │   ├── templates/
│   │   │   ├── files/
│   │   │   ├── users/
│   │   │   └── departments/      # ADMIN-only area
│   │   └── api/
│   │       ├── worker/           # Render Worker REST (versioned, external)
│   │       ├── telegram/         # Telegram webhook (if webhook mode)
│   │       └── health/
│   │
│   ├── features/                 # one folder per module; the heart of the app
│   │   ├── auth/
│   │   ├── users/
│   │   ├── departments/
│   │   ├── files/
│   │   ├── templates/
│   │   ├── jobs/
│   │   └── telegram/
│   │
│   ├── server/                   # cross-feature server-only building blocks
│   │   ├── db/                   # Prisma client singleton
│   │   ├── auth/                 # session read/verify, role/department helpers
│   │   ├── authz/                # permission checks, department-scope guards
│   │   ├── adapters/             # youtube/, telegram/, storage/, media/, clock/, id/
│   │   ├── validation/           # shared Zod helpers
│   │   └── errors/               # typed application errors → transport mapping
│   │
│   ├── components/               # shared UI (shadcn/ui wrappers, layout, primitives)
│   ├── lib/                      # framework-agnostic pure utilities (client-safe)
│   └── types/                    # shared type declarations
│
└── tests/ (or co-located *.test.ts)
```

### Notes on the starting structure from the brief

The brief proposed `src/app`, `src/features`, `src/components`, `src/lib`, `src/server`,
`src/types`. Studio adopts it with these clarifications:

- **`features/`** holds each module's UI, Server Actions, use cases, repositories,
  domain types, and validation — co-located. This is the primary place work happens.
- **`server/`** holds only things shared *across* features (Prisma client, auth/session,
  authz primitives, external adapters). Feature code imports from `server/`, never the
  reverse.
- **`lib/`** is for pure, dependency-light utilities that are safe on both client and
  server. No Prisma, no `next/*` server APIs.
- **`app/`** is presentation wiring only: route segments, layouts, loading/error UI, and
  the thin `route.ts` handlers for external clients.

## 2. Anatomy of a feature folder

```
features/jobs/
├── ui/                       # Server + Client Components for job screens
├── actions/                  # 'use server' entry points (thin)
│   ├── create-job.action.ts
│   ├── cancel-job.action.ts
│   └── retry-job.action.ts
├── use-cases/                # ALL business logic, transport-agnostic
│   ├── create-job.ts
│   ├── claim-next-job.ts     # used by the Worker Route Handler
│   ├── report-progress.ts
│   ├── change-state.ts
│   ├── cancel-job.ts
│   ├── retry-job.ts
│   └── complete-and-deliver.ts
├── domain/
│   ├── job-state.ts          # state enum + allowed transitions
│   ├── job.types.ts
│   └── invariants.ts
├── validation/               # Zod schemas per use case input
├── repository/
│   └── job.repository.ts     # the only Prisma access for jobs
└── read/                     # read models / query functions for pages
```

The `templates`, `files`, `users`, `departments`, `auth`, `telegram` features follow the
same anatomy (not every feature needs every folder).

## 3. Layer responsibilities

| Layer | May depend on | Must not | Responsibilities |
|---|---|---|---|
| **`app/` (pages, layouts)** | `features/*/ui`, `features/*/read`, `server/auth` | Prisma, use cases' internals, business rules | Routing, layout, suspense/error boundaries, calling read functions & Server Actions |
| **`app/api/**` (Route Handlers)** | `features/*/use-cases`, `server/auth`, `server/errors` | business logic, Prisma directly | Parse request, authenticate (service credential / session), validate, call use case, map to HTTP + status codes, API versioning |
| **`features/*/actions` (Server Actions)** | `features/*/use-cases`, `server/auth`, feature `validation` | business logic, Prisma directly | `'use server'`, get session, validate input, call use case, return typed result / error |
| **`features/*/use-cases`** | feature `domain`, feature `repository`, `server/authz`, `server/adapters`, `server/errors` | `next/*` request APIs, transport concerns, other features' repositories | Enforce authorization, enforce invariants & state machine, orchestrate repositories + adapters, transactions, emit domain events / schedule durable work |
| **`features/*/domain`** | nothing (pure) | I/O of any kind | Types, enums, the state machine, pure invariant functions |
| **`features/*/repository`** | `server/db` (Prisma), feature `domain` | business rules, authorization decisions (but **does** apply department-scope filters defensively) | CRUD + queries, mapping Prisma rows ↔ domain types, atomic operations (locking) |
| **`features/*/read`** | `server/db` or repository, `server/auth` | mutations | Query functions/read models for pages; apply department scoping |
| **`server/adapters/*`** | the external SDK/CLI | domain rules | Wrap one external system behind an interface; handle its errors/retries/timeouts |
| **`components/`, `lib/`** | each other, React | Prisma, server-only APIs (for `lib/`) | Reusable UI; pure helpers |

## 4. Cross-cutting conventions

- **Prisma client**: a single instance from `server/db`. Never `new PrismaClient()` in
  feature code.
- **Time & IDs**: use `server/adapters/clock` and `server/adapters/id` so use cases are
  deterministic in tests. No `new Date()` / `Math.random()` / `crypto.randomUUID()` in
  use cases.
- **Errors**: use cases throw typed errors from `server/errors` (`NotFoundError`,
  `ForbiddenError`, `ConflictError`, `ValidationError`, …). Route Handlers and Server
  Actions translate them; nothing else catches them.
- **Department scoping**: every repository/read function that lists or fetches a scoped
  entity takes an actor context and filters by department unless the actor is ADMIN.
  This is defense in depth — the use case checks authorization first.
- **No barrel files that cross layers.** A feature does not re-export another feature's
  repository.
