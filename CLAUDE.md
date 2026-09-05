# CLAUDE.md — Studio

> **Entry point for every Claude Code / AI agent session in this repository.**
> Read this file first. Then read the relevant documents under [`docs/`](docs/) before
> implementing or modifying anything.

---

## 1. What Studio is

**Studio** is a standalone **Next.js (App Router, TypeScript)** application — frontend and
backend in one deployable — for operating a **video-rendering job pipeline**:

- Operators define reusable **Templates** (a render recipe + a set of asset slots).
- Operators create **Jobs** that bind concrete media/text to a Template's slots.
- An external **Render Worker** (not in this repo) polls Studio over REST, renders the
  video, reports progress/state, and uploads the finished file.
- On completion, the video is optionally delivered to **YouTube** and/or **Telegram**.
- A **Telegram Bot** offers an alternative conversational way to create and monitor Jobs.
- A **File Gallery** stores reusable media assets.

Studio replaces the `src/render` module of the legacy NestJS backend
`qtical-backend-node`. It is a **rewrite on a new architecture**, not a port.

## 2. Where the documentation lives

| Area                                 | Path                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Documentation index                  | [`docs/README.md`](docs/README.md)                                                             |
| Glossary                             | [`docs/glossary.md`](docs/glossary.md)                                                         |
| Architecture overview                | [`docs/architecture/overview.md`](docs/architecture/overview.md)                               |
| Server Actions vs REST boundaries    | [`docs/architecture/boundaries.md`](docs/architecture/boundaries.md)                           |
| Project / folder structure           | [`docs/architecture/project-structure.md`](docs/architecture/project-structure.md)             |
| Tech stack & versions                | [`docs/architecture/tech-stack.md`](docs/architecture/tech-stack.md)                           |
| Server Actions convention            | [`docs/architecture/server-actions.md`](docs/architecture/server-actions.md)                   |
| REST Route Handler convention        | [`docs/architecture/rest-architecture.md`](docs/architecture/rest-architecture.md)             |
| Server / Client component boundary   | [`docs/architecture/server-client-boundary.md`](docs/architecture/server-client-boundary.md)   |
| Authentication boundary              | [`docs/architecture/authentication-boundary.md`](docs/architecture/authentication-boundary.md) |
| Authentication (implementation)      | [`docs/architecture/authentication.md`](docs/architecture/authentication.md)                   |
| Authorization (mechanism)            | [`docs/architecture/authorization.md`](docs/architecture/authorization.md)                     |
| Authorization workflow (how-to)      | [`docs/development/authorization.md`](docs/development/authorization.md)                       |
| Database (Prisma/PostgreSQL)         | [`docs/architecture/database.md`](docs/architecture/database.md)                               |
| Database workflow (local dev)        | [`docs/development/database.md`](docs/development/database.md)                                 |
| Error handling & error model         | [`docs/architecture/error-handling.md`](docs/architecture/error-handling.md)                   |
| Environment configuration            | [`docs/architecture/environment.md`](docs/architecture/environment.md)                         |
| Logging                              | [`docs/architecture/logging.md`](docs/architecture/logging.md)                                 |
| Data flow                            | [`docs/architecture/data-flow.md`](docs/architecture/data-flow.md)                             |
| Architecture Decision Records (ADRs) | [`docs/architecture/decisions.md`](docs/architecture/decisions.md)                             |
| Domain: Users                        | [`docs/domain/users.md`](docs/domain/users.md)                                                 |
| Domain: Departments                  | [`docs/domain/departments.md`](docs/domain/departments.md)                                     |
| Domain: Files / Gallery              | [`docs/domain/files.md`](docs/domain/files.md)                                                 |
| Domain: Templates                    | [`docs/domain/templates.md`](docs/domain/templates.md)                                         |
| Domain: Jobs                         | [`docs/domain/jobs.md`](docs/domain/jobs.md)                                                   |
| Authorization model                  | [`docs/domain/authorization.md`](docs/domain/authorization.md)                                 |
| Database direction & entities        | [`docs/data/database.md`](docs/data/database.md)                                               |
| Data lifecycle rules                 | [`docs/data/lifecycle-rules.md`](docs/data/lifecycle-rules.md)                                 |
| Historical data integrity            | [`docs/data/historical-integrity.md`](docs/data/historical-integrity.md)                       |
| Worker REST API                      | [`docs/integrations/worker-api.md`](docs/integrations/worker-api.md)                           |
| Telegram integration                 | [`docs/integrations/telegram.md`](docs/integrations/telegram.md)                               |
| YouTube integration                  | [`docs/integrations/youtube.md`](docs/integrations/youtube.md)                                 |
| Security requirements                | [`docs/security/security.md`](docs/security/security.md)                                       |
| Legacy system overview               | [`docs/legacy/overview.md`](docs/legacy/overview.md)                                           |
| Legacy render module — reading guide | [`docs/legacy/render-module.md`](docs/legacy/render-module.md)                                 |
| Legacy render module (deep analysis) | [`docs/legacy/render-module-analysis.md`](docs/legacy/render-module-analysis.md)               |
| Legacy known issues                  | [`docs/legacy/known-issues.md`](docs/legacy/known-issues.md)                                   |
| Legacy → Studio mapping              | [`docs/legacy/legacy-vs-studio.md`](docs/legacy/legacy-vs-studio.md)                           |
| Compatibility matrix                 | [`docs/legacy/compatibility-matrix.md`](docs/legacy/compatibility-matrix.md)                   |
| Frontend conventions                 | [`docs/frontend/conventions.md`](docs/frontend/conventions.md)                                 |
| Theme system                         | [`docs/frontend/theme.md`](docs/frontend/theme.md)                                             |
| Development conventions              | [`docs/development/conventions.md`](docs/development/conventions.md)                           |
| Development workflow                 | [`docs/development/workflow.md`](docs/development/workflow.md)                                 |
| **OPEN DECISION register**           | [`docs/development/open-decisions.md`](docs/development/open-decisions.md)                     |

The legacy repository is at `/home/mahdirazaqi/Projects/qtical-backend-node`
(module of interest: `src/render`).

## 3. Mandatory workflow for AI agents

> **Before implementing or modifying any significant feature, first read the relevant
> Studio documentation, and inspect the legacy implementation when the feature
> originates from the legacy system.**

1. Read this file.
2. Read the `docs/` pages relevant to the task (use the table above).
3. If the feature derives from legacy behavior, open the corresponding legacy source
   under `/home/mahdirazaqi/Projects/qtical-backend-node/src/render` and confirm the
   actual behavior. Do not trust summaries alone for security- or correctness-sensitive
   work.
4. Implement following the architecture rules below.
5. If the docs do not answer a question, see rule §9 (ambiguity).
6. Record any architectural decision you make in
   [`docs/architecture/decisions.md`](docs/architecture/decisions.md).

## 4. Source-of-truth priority

When sources conflict, resolve in this order (highest wins):

1. **Explicit Studio requirements** (from the product owner / phase briefs)
2. **Explicit architectural decisions** (ADRs in `docs/architecture/decisions.md`)
3. **Studio documentation** (the rest of `docs/`)
4. **Legacy behavioral requirements** (what the legacy system does for the business)
5. **Legacy implementation details** (how the legacy code happens to do it)

The legacy code **never** overrides a deliberate Studio architectural decision.
But do **not** silently discard legacy business behavior — if it looks important and
Studio requirements are silent, record it as an **OPEN DECISION** (rule §9).

## 5. Architectural rules (non-negotiable)

- **The legacy system is a behavioral reference, not an architectural source of truth.**
  Never copy legacy code, schemas, or services into Studio.
- **Layering:** `UI (Server / Client Components)` → `Server Action` → `Application
Service / Use Case` → `Repository (Prisma)`. External clients enter through a
  `Route Handler` instead of a Server Action, then join the same service layer.
- **The UI contains no business logic.** Business rules live in the application/domain
  layer and are reachable identically from Server Actions, Route Handlers, and the
  Telegram adapter.
- **Authorization is always enforced server-side**, in or below the application service
  layer. Hiding a button is not authorization. Every entry point re-checks.
- **Prefer Server Actions and Server Components** for all internal panel operations.
  Do **not** build internal REST endpoints for UI features.
- **REST exists only for external clients** with a stable HTTP contract — at minimum the
  Render Worker. See [`docs/architecture/boundaries.md`](docs/architecture/boundaries.md).
- **Database is PostgreSQL + Prisma.** No MongoDB / Mongoose. See ADR-0002. Implemented as
  of Phase 2 (`prisma/schema.prisma`, `src/server/db`) — see
  [`docs/architecture/database.md`](docs/architecture/database.md). **Prisma is
  server-only**: only feature repositories (`src/features/<feature>/repository/*.ts`)
  import `@/server/db`; nothing else imports `@prisma/client` or constructs a
  `PrismaClient`.
- **Every scoped resource carries a `departmentId`** and every query is department-scoped
  at the repository/service layer (ADMIN bypasses). See
  [`docs/domain/authorization.md`](docs/domain/authorization.md).
- **Authentication is implemented (Phase 2); full authorization is not (Phase 3).**
  `getCurrentUser()` / `requireUser()` (`@/server/auth/current-user`) resolve a real,
  DB-backed session — see [`docs/architecture/authentication.md`](docs/architecture/authentication.md)
  (ADR-0020). `@/server/authz`'s `authorize()` still only allows ADMIN, exactly as Phase 1
  left it, until Phase 3 implements the real capability matrix. **Never bypass the
  authentication boundary**: identity is read only through `@/server/auth/*` (never read
  cookies/sessions elsewhere), and a use case's authorization decision is never skipped
  just because the caller "already checked."
- **Every User belongs to exactly one Department; roles are `USER` / `MANAGER` /
  `ADMIN`.** Users are **never deleted** — `status` is `ACTIVE` or `DISABLED`, and a
  `DISABLED` user cannot authenticate (enforced by the session-resolution query itself, so
  disabling takes effect on every existing session immediately, not just new logins).
- **Passwords and session internals are server-only and never exposed.** Password hashes
  (`@/server/auth/password`, bcrypt via `bcryptjs`) and raw session tokens
  (`@/server/auth/session`) are never logged, never returned to a client component, and
  never leave `@/server/auth` / the `features/auth` and `features/users` repository layer
  that specifically needs them for the credential check.
- **No process-local state** for anything that must survive a restart or scale
  horizontally (this killed the legacy Telegram wizard). Durable state → PostgreSQL.
- **Server/client boundary:** UI components must not import `@/server/*` or `server-only`
  (ESLint-enforced). Default to Server Components; `"use client"` only at interactive
  leaves. See [`docs/architecture/server-client-boundary.md`](docs/architecture/server-client-boundary.md).
- **Conventions are code, not prose:** Server Actions go through `defineAction`
  (`@/server/actions`), Route Handlers through `defineRouteHandler` (`@/server/api`),
  errors are `AppError` + `toPublicError` (`@/server/errors`), input is `parseInput`
  (`@/server/validation`), env is `@/server/env`, logs are `@/server/logger`. Follow the
  existing pattern; see the architecture docs above.
- **`process.env` is read only in `@/server/env`.** Never elsewhere.

## 6. Data lifecycle rules (critical)

| Entity       | Deletion policy                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Job**      | **Never deleted.** No hard delete, no soft delete. Permanent historical record. Retry creates a **new** Job linked to the original.                                                                                                                     |
| **Template** | **Soft-delete only** (`deletedAt` / status). Row stays forever so historical Jobs resolve their Template. Hidden from pickers when deleted/disabled.                                                                                                    |
| **User**     | **Never deleted.** `status` is `ACTIVE` / `DISABLED` (implemented, Phase 2). A `DISABLED` user cannot authenticate. Historical records keep referencing the User.                                                                                       |
| **File**     | **Hard delete allowed when safe.** Two categories: _Persistent Gallery Assets_ (kept until explicitly deleted) and _Job Artifacts_ (may be auto-deleted after the Job completes). A file may be deleted only when no active/required dependency breaks. |

Full detail: [`docs/data/lifecycle-rules.md`](docs/data/lifecycle-rules.md).

## 7. Historical integrity rule (critical)

Opening an old Job must **always** show a coherent record: its Template, its creator, its
asset values, its timeline — none of it "missing" or "destroyed". A foreign key alone
does **not** guarantee this. Where a Job needs immutable knowledge of a Template/File as
it was at creation time, the design must use **snapshots / immutable references**, not
just an FK. See [`docs/data/historical-integrity.md`](docs/data/historical-integrity.md).
Exact snapshot shape is an **OPEN DECISION**.

## 8. Authorization rules (summary)

Three roles. Every rule is enforced server-side; see
[`docs/domain/authorization.md`](docs/domain/authorization.md) for the full matrix and
[`docs/architecture/authorization.md`](docs/architecture/authorization.md) for the
mechanism (**implemented, Phase 3**).

- **USER** — normal operator. Works with Jobs / Files / Templates **within their own
  Department**, per the permission matrix.
- **MANAGER** — manages users, templates, jobs, files, and department-level operations
  **within their own Department**.
- **ADMIN** — system-wide: all departments, all users, all resources.

Telegram users map to the **same** User + Department + role and get the **same** checks.
Telegram must never bypass authorization.

**Permanent rules, non-negotiable (Phase 3):**

- **Never trust a client-supplied `role` or `departmentId`.** For USER/MANAGER, both are
  always derived from the authenticated `Actor`; only ADMIN may supply a `departmentId`
  explicitly, and only for operations the matrix grants ADMIN.
- **Never rely on a hidden UI button, disabled field, or filtered nav item as
  authorization.** `navigationForRole` and the Overview page's filtered list are a
  presentation choice only — every route they point at (e.g. `/users`, `/departments`)
  re-checks the actor's role itself, because direct URL access must be blocked
  independently of what got rendered.
- **Every use case's first step is `authorize(actor, capability, { departmentId? })`**
  (`@/server/authz`) — never an inline `actor.role === "ADMIN"` check. A capability with
  no registered policy fails loudly (`internal`), by design — that is not a bug to work
  around by adding a permissive fallback.
- **A specific resource load uses `assertDepartmentScopeOrNotFound` (404, never 403)**;
  a list/search/count query spreads `departmentScopeFilter(actor)` into its `where`
  clause. Do not hand-roll either pattern differently per feature.
- **No self-service privilege escalation, ever** — nobody changes their own role or
  their own active/disabled status, not even ADMIN
  (`src/features/users/use-cases/authorize-user-management.ts`, ADR-0023). A MANAGER may
  only ever create/manage a `USER`-role account, never a peer MANAGER or an ADMIN.
- **Users are never deleted; disabled users cannot authenticate or act** — enforced once,
  at the session-resolution layer (`@/server/auth`), not re-checked per authorization
  call (an `Actor` cannot exist for a disabled user by construction).
- **Do not introduce a policy engine, permission tables, or configurable RBAC.** Studio
  has exactly three fixed roles; a fourth role or a materially different rule shape is a
  new ADR, not a registry edit.
- **Do not implement authorization in Next.js middleware.** The `(dashboard)` layout's
  session check is the only coarse-grained gate; resource-level authorization lives in
  use cases/pages, per `docs/architecture/authorization.md` "Why not middleware".

## 9. Handling ambiguity

- **Never invent business requirements when the documentation does not define them.**
- Mark the gap as **`OPEN DECISION`** inline in the doc you are editing, add it to
  [`docs/development/open-decisions.md`](docs/development/open-decisions.md), and — when
  the decision blocks you — ask the user for clarification.
- When you record an OPEN DECISION, also record **the consequence of each option**, so
  whoever decides has what they need.
- Do not "temporarily" pick an answer and build on it silently.

## 10. Worker REST compatibility

Studio must keep the existing Render Worker working with minimal changes. The legacy
endpoints (`POST /files`, `GET /jobs/fetch`, `GET /jobs/:id`,
`PATCH /jobs/:id/progress|duration|state`, `POST /jobs/:id/upload`) are the compatibility
baseline. The **one deliberate break**: the Worker API **must be authenticated** (it was
not in legacy). See [`docs/integrations/worker-api.md`](docs/integrations/worker-api.md)
and [`docs/legacy/compatibility-matrix.md`](docs/legacy/compatibility-matrix.md).

## 11. Security rules (summary)

Full document: [`docs/security/security.md`](docs/security/security.md). Highlights:

- Authenticated + authorized on every entry point (UI, REST, Telegram).
- Worker API authenticated via a service credential (mechanism = OPEN DECISION).
- **No shell string interpolation.** If Studio ever shells out (ffmpeg/ImageMagick),
  use `execFile`/`spawn` with an argument array — never `exec` with a built string.
  Legacy had a real command-injection hole here.
- Atomic Job claiming (legacy `fetch` had a race).
- All file uploads validated by real content type, size, and a sanitized stored name.
- Validate every input at the boundary (Zod or equivalent) — Server Actions included.
- Secrets only via environment / secret manager; never in the repo.

## 12. Frontend conventions (summary)

Panel-only app, **no landing page**. Next.js App Router + React + TypeScript + Tailwind +
shadcn/ui. **LTR**, **English** UI and messages. Responsive with an excellent mobile
experience. **Light / Dark / System** themes. Full detail:
[`docs/frontend/conventions.md`](docs/frontend/conventions.md).

## 13. Phase status

- **Phase 0 (documentation & architecture foundation) — complete.**
- **Phase 1 (Next.js foundation & application skeleton) — complete.** Dashboard shell,
  theme system, feature-based structure, and the `@/server/*` conventions (env, logging,
  errors, validation, actions, REST, auth/authz boundaries) are in place.
- **Phase 2 (database & authentication) — complete.** PostgreSQL + Prisma
  (`Department`, `User`, `Session`), a real DB-backed session mechanism (ADR-0020), bcrypt
  password hashing, sign-in/sign-out (`features/auth`), and a genuinely protected
  dashboard (`(dashboard)/layout.tsx` redirects unauthenticated/disabled sessions to
  `/sign-in`).
- **Phase 3 (authorization & department isolation) — complete.** The real capability
  registry (`@/server/authz`, ADR-0022) replaces the Phase 1 ADMIN-only placeholder;
  department-scope helpers (`assertDepartmentScopeOrNotFound`, `departmentScopeFilter`);
  user-management escalation/self-modification policy prepared ahead of the feature
  itself (ADR-0023); `/users` and `/departments` are protected server-side, not just
  hidden from nav. The app runs (`npm run dev`), builds (`npm run build`), and passes
  `npm run check` (lint + typecheck + format + tests). **Still no user/department
  management UI, no domain features (Templates/Jobs/Files/Worker/Telegram/YouTube).**

Do **not** start the next phase (user/department management, then the domain features)
unless explicitly asked. See
[`docs/development/workflow.md`](docs/development/workflow.md) for phase boundaries and
[`docs/development/open-decisions.md`](docs/development/open-decisions.md) for what
remains undecided.

### Quick start

```
npm install                    # Node >= 20.9, npm >= 10 (also runs `prisma generate`)
cp .env.example .env           # set DATABASE_URL to a real local PostgreSQL
npm run db:migrate             # apply migrations
npm run db:seed                # optional: seed a dev Department (+ ADMIN if configured)
npm run dev                    # http://localhost:3000
npm run check                  # lint + typecheck + format:check + test
```

See [`docs/development/database.md`](docs/development/database.md) for local Postgres
setup and the full migration/seed workflow.
