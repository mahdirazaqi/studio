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
  video, reports progress/state, and sends back the finished file — a Job's lifecycle
  ends at `RENDERED`. **Studio does not upload rendered Jobs to YouTube or anywhere else**
  (ADR-0041); the operator is notified via Telegram (best-effort) on completion.
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
| Files / storage (mechanism)          | [`docs/architecture/files.md`](docs/architecture/files.md)                                     |
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

The actual Render Worker repository is at `/home/mahdirazaqi/Projects/navaak-ae-renderer`
(Go, two binaries: `cmd/worker` supervises `cmd/renderer`, which does the real
fetch/render/report loop). **It is immutable — never modify it.** It is the source of
truth for the Worker REST API contract (ADR-0043); Studio's own design intent for that
contract is a starting point, not a substitute for reading this source when the two
disagree. See [`docs/integrations/worker-api.md`](docs/integrations/worker-api.md).

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
5. If the docs do not answer a question, see rule §12 (ambiguity).
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
Studio requirements are silent, record it as an **OPEN DECISION** (rule §12).

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
- **`department:manage`/`department:view_all` and `worker_key:manage` are both
  ADMIN-only** — connecting/scoping shared infrastructure (Departments, Worker
  credentials) is system-wide configuration, not a Department-local MANAGER operation
  (ADR-0040). The `/departments` and `/worker-keys` nav items and pages are both
  ADMIN-only accordingly; a non-ADMIN still sees their own Department's name in the
  sidebar/profile area (`CurrentUser.departmentName`) without needing the management
  page. (`youtube:manage` existed the same way, Phases 9–11 — it was removed entirely
  along with the rest of YouTube upload, ADR-0041.)

## 9. Files & storage rules (summary)

Full detail: [`docs/architecture/files.md`](docs/architecture/files.md),
[`docs/domain/files.md`](docs/domain/files.md). **Implemented, Phase 4.**

- **Files are hard-deleted when safe — never soft-deleted.** There is no `deletedAt` on
  `File`. Deletion order is fixed: the database row first, then the storage bytes — never
  the reverse (ADR-0025).
- **`File.storageKey` never crosses into a client-facing type or response.** The browser
  only ever knows a File's `id`; bytes are served through the authenticated,
  department-scoped `/api/files/[fileId]` route, which re-resolves the storage key
  server-side on every request. Do not add a field or endpoint that returns a raw storage
  key or path to the client.
- **The domain/application layer never imports `node:fs` or a storage SDK directly** —
  only `@/server/adapters/storage` does. A new storage backend is a new file behind
  `StorageAdapter`, never a change to call sites (ADR-0024).
- **Never trust a client-declared filename or MIME type for validation.** Content type is
  sniffed from the actual bytes (`@/server/media`); the allow-list and per-kind size
  limits live in `features/files/domain/file-types.ts` (ADR-0026) — centralized, not
  re-implemented per form/action.
- **A deleted File must never break a historical record.** A Job that resolves a File
  copies the metadata it needs into its own `JobAsset` row at creation time (ADR-0010,
  ADR-0028) rather than depending on the File row surviving — see
  `docs/architecture/files.md` "Historical integrity contract for Job/Template features"
  (ADR-0025) before wiring a new feature to Files. **Templates are different**: a
  Template's File reference (`TemplateAsset.defaultFileId`) is a live field on a mutable
  resource, not a historical record — see §10 below.
- **`File.category = JOB_ARTIFACT` still exists but nothing creates one yet** — that
  needs a result-upload endpoint (Phase 7+), not part of Phase 6. The **input** side of
  the Job↔File relationship is implemented: `assertNoActiveJobDependencies`
  (`features/files/use-cases/authorize-file-management.ts`) is a real check, not a
  no-op — implement any future artifact-side check _inside that same function_, never a
  parallel one. `assertNoActiveTemplateDependencies` (the same file) is Templates'
  equivalent — see §10.

## 10. Templates rules (summary)

Full detail: [`docs/domain/templates.md`](docs/domain/templates.md),
[`docs/architecture/decisions.md`](docs/architecture/decisions.md) ADR-0006/ADR-0027.
**Implemented, Phase 5.**

- **`status` (`ACTIVE`/`DISABLED`) and `deletedAt`/`deletedByUserId` are two independent
  fields — never combine them.** Disabled = hidden from new-Job creation, still fully
  editable. Deleted (soft, ADR-0006) = additionally un-editable and out of management
  lists, row kept forever. A soft-deleted Template can never be enabled, disabled, or
  edited again; enabling/disabling/soft-deleting an already-enabled/disabled/deleted
  Template is a no-op, not an error.
- **`template:manage` (create/edit/enable/disable/soft-delete) is MANAGER+ only; USER gets
  `template:view` only** (view/list their own department's Templates) — confirmed for
  Phase 5 (resolves OD-04). Do not expand USER's Template capabilities without the same
  level of explicit confirmation this required.
- **`Template.name` is unique per Department among non-deleted rows** (ADR-0027, resolves
  OD-09), enforced by a **partial** unique DB index added by hand into the migration SQL —
  `schema.prisma` cannot declare a filtered unique constraint natively. Never add a
  pre-check query in place of relying on this DB constraint + catching its violation; do
  add the catch (translate to a clean `conflict` error, never a raw Prisma error) if a new
  write path is added.
- **A Template asset's optional `defaultFileId` must belong to the Template's own
  Department, verified server-side on every write** — never trust a client-supplied File
  id, and never validate it against the _actor's_ department when they differ (ADMIN
  authoring for another department). See `features/templates/use-cases/
verify-file-references.ts`.
- **A File referenced by any Template asset's `defaultFileId` (deleted Template or not)
  cannot be deleted** — `assertNoActiveTemplateDependencies`
  (`features/files/use-cases/authorize-file-management.ts`) is called from `deleteFile`
  and throws a clean `conflict` error. Do not add a second, parallel dependency check;
  extend this one if the rule ever needs to change.
- **Editing a Template replaces its entire asset list wholesale** (delete all, recreate),
  not a per-asset diff — this is deliberate and documented, not a shortcut to fix later.
- **Job creation now enforces Template state (disabled/deleted) — implemented, Phase 6.**
  `features/jobs/use-cases/create-job.ts` rejects a `DISABLED` or soft-deleted Template —
  the enforcement point Templates' own design always deferred to "a future Job feature."
- **Template Edit can never change a Template's Department — for any role, including
  ADMIN — enforced structurally, not by a runtime role check (Phase 13, ADR-0042).**
  `templateInputSchema` has no `departmentId` field at all; a client-submitted value is
  stripped by Zod before `updateTemplate` ever sees it, and `updateTemplate`/
  `updateTemplateWithAssets` never read, derive, or forward one. **Department transfer
  is a separate, ADMIN-only operation** — `transferTemplateDepartment` (its own
  use-case/schema/action/repository function — the only one that ever writes
  `Template.departmentId`), gated by `requireRole(actor, "ADMIN")`, not just the
  `template:manage` floor a MANAGER also holds, rendered as its own "Transfer
  department" control, never inside the edit form. The dependent asset `defaultFileId`
  reference is re-verified against the **target** Department, never silently left
  pointing at the original. No historical-integrity mechanism was needed for this:
  `Job.departmentId` is a plain column copied once at Job creation, never a live join
  through the Template — see `docs/domain/templates.md` "Department transfer" before
  touching this code path. Do not fold transfer back into `updateTemplate`, and do not
  add a second `departmentId`-accepting Template write path outside `createTemplate`
  (creation, ADMIN-only optional) and `transferTemplateDepartment`.
- **No `description`/`tags`/`youtubeTargetId` fields — removed, ADR-0041.** A Template
  describes only the render itself; Studio has no YouTube (or any other external)
  delivery destination to configure. Do not reintroduce delivery-destination fields on
  Template without a new ADR.

## 11. Jobs rules (summary)

Full detail: [`docs/domain/jobs.md`](docs/domain/jobs.md),
[`docs/architecture/decisions.md`](docs/architecture/decisions.md)
ADR-0005/ADR-0028/ADR-0029/ADR-0031/ADR-0040/ADR-0041. **Implemented, Phase 6**
(domain/application layer + dashboard UI), **Worker REST API Phase 7**, **rendered-result
acceptance Phase 9**, **YouTube upload removed, Phase 12 (ADR-0041) — a Job's lifecycle
now ends at `RENDERED`.**

- **A Job is never deleted, never soft-deleted, and never generically edited.** No
  `deleteJob`/`editJob` exists or should ever exist. Every mutation is one of the named
  lifecycle operations: `createJob`, `transitionJob` (+ its callers `claimNextJob`/
  `cancelJob`/`acceptJobResult`), `updateJobProgress`, `updateJobDuration`, `retryJob`.
- **`Job.state` is written only via `transitionJobRow`'s atomic conditional `UPDATE ...
WHERE state IN (fromStates)`** — never a read-then-write, never a direct
  `db.job.update({ data: { state } })` anywhere else. This is what makes a Worker-vs-human
  state race safe. Adding a new state-changing operation means calling `transitionJob`
  (or `transitionJobRow` directly, if `transitionJob`'s pre-check doesn't fit), not
  inventing a new update path.
- **`RENDERED` is a terminal state — there is no `DELIVERING`/`UPLOADED` after it
  (removed, ADR-0041).** `accept-job-result.ts` transitions `RENDERING -> RENDERED`
  atomically together with the three artifact File ids, sends one best-effort "rendered"
  Telegram notification, and returns — it never calls any external delivery API and
  never attempts a further state transition. Do not reintroduce a delivery step without
  a new ADR.
- **The Job's Department is always derived from its Template** (`template.departmentId`)
  — there is no separate `departmentId` input to a Job-creation request, by construction.
  Never add one.
- **Historical integrity is two pieces, not one**: `Job.snapshot` (JSONB, Template-level
  fields, immutable) and `JobAsset` rows (resolved per-slot values, each with its own
  copied File metadata, immutable). Neither is ever updated after creation. Do not fold
  `JobAsset` into the JSONB blob, and do not add an update path to either.
- **Retry copies the original Job's `snapshot`/`JobAsset` rows verbatim — never re-loads
  the live Template or re-resolves Files.** This is not an optimization; it is the
  historical-integrity guarantee itself (ADR-0031). If a future change makes `retryJob`
  touch `features/templates/repository` or `features/files/repository`, that is a bug.
- **Retry eligibility is `ERROR`/`CANCELED` only, within `JOB_RETRY_WINDOW_DAYS`** —
  narrower than legacy on purpose (resolves OD-02). Cancel eligibility is
  `QUEUED`/`CLAIMED`/`RENDERING` only. Both live in
  `features/jobs/domain/job-state-machine.ts` — the one place these sets are defined.
- **No upload quota — removed, ADR-0041.** `JOB_UPLOAD_DAILY_CAP`, its Postgres
  advisory-lock enforcement, and `Job.deliverToYouTube` (what it gated) are all gone —
  there is no YouTube upload left to cap. Do not reintroduce a quota mechanism without a
  concrete new requirement and a new ADR.
- **The Worker is never a `User` and never becomes an `Actor`.** `claimNextJob`,
  `updateJobProgress`, `updateJobDuration`, and `transitionJob` take no `Actor`
  parameter — do not add one "for consistency." Worker Route Handlers authenticate the
  Worker's service credential first (`allowedDepartmentIds`, ADR-0040), then call these
  functions directly.
- **`job:manage` (view/create/cancel/retry) is USER+, whole-department** — resolves OD-03
  for Jobs as collaborative, not "own resources only." Do not narrow this to
  creator-only without the same level of explicit confirmation Phase 5's OD-04 required.
- **Legacy Worker state codes `6` (Uploading)/`7` (Uploaded) are no longer mapped**
  (`legacy-state-mapping.ts`) — a Worker sending either gets a `422 validation` error,
  same as any other unrecognized value. Do not remap them to anything; the concept they
  described no longer exists in Studio.
- **Not implemented, deliberately**: rendering itself (the external Worker's own job), a
  requeue sweep for stuck `CLAIMED`/`RENDERING` jobs (OD-31), bulk cancel, any external
  delivery destination for a rendered result.

## 12. Handling ambiguity

- **Never invent business requirements when the documentation does not define them.**
- Mark the gap as **`OPEN DECISION`** inline in the doc you are editing, add it to
  [`docs/development/open-decisions.md`](docs/development/open-decisions.md), and — when
  the decision blocks you — ask the user for clarification.
- When you record an OPEN DECISION, also record **the consequence of each option**, so
  whoever decides has what they need.
- Do not "temporarily" pick an answer and build on it silently.

## 13. Worker API rules (summary)

Full detail: [`docs/integrations/worker-api.md`](docs/integrations/worker-api.md),
[`docs/architecture/decisions.md`](docs/architecture/decisions.md)
ADR-0004/ADR-0033/ADR-0034/ADR-0040/ADR-0043. **Implemented, Phase 7, per-Worker
Department-scoped API keys implemented Phase 11 (ADR-0040, supersedes ADR-0032)** —
versioned under `/api/v1/worker/**`, plus a Worker-auth branch on
`/api/files/[fileId]`. **Verified/fixed against the actual Worker's real source, Phase
14 (ADR-0043)** — every rule below marked "(ADR-0043)" replaced a design that was
never actually checked against the real `navaak-ae-renderer` repository and would have
broken the real integration; do not revert any of them without re-reading ADR-0043 and
re-checking the real Worker source first.

- **Every `/api/v1/worker/**` Route Handler is a thin `defineRouteHandler` wrapper**:
  `authenticate: authenticateWorker` (`@/server/worker-auth`), a Zod `params`/`body`
  schema, and a handler that destructures `ctx.auth.allowedDepartmentIds` and passes it
  into a Phase 6 use case (or a small Phase 7 adapter over one — `transitionJobForWorker`,
  `getJobForWorker` — for input mapping only), which maps the result. **Never** write Job
  state-machine logic, quota logic, or a raw Prisma mutation directly inside a route
  handler — that logic already exists in `features/jobs/use-cases/*` (Phase 6); the
  Worker layer only authenticates, validates, and delegates.
- **`authenticateWorker` is the only place a Worker credential is read, hashed, or
  compared.** Each Worker identity is a `WorkerApiKey` row (`keyHash` — SHA-256, `@unique`
  — looked up by hash, exactly like `Session.tokenHash`; a database read alone never
  yields a usable credential, ADR-0020's trust model reused verbatim, ADR-0040). Do not
  add a second Worker-auth check anywhere else, and do not log the `Authorization` header
  or any part of a Worker secret.
- **Every Worker Job operation is Department-scoped, server-side, never client-supplied
  (ADR-0040).** `authenticateWorker` resolves `WorkerAuthContext { workerApiKeyId,
allowedDepartmentIds }` once, at authentication — handed to every handler as `ctx.auth`
  (`defineRouteHandler`'s `TAuth` generic). `claimNextJobRow`'s atomic `SELECT ... FOR
UPDATE SKIP LOCKED` filters `WHERE "departmentId" = ANY(allowedDepartmentIds)` as part
  of the same atomic statement — never a post-hoc check after a row is already locked.
  Every other Worker Job operation (`getJobForWorker`, `transitionJobForWorker`,
  `updateJobProgress`, `updateJobDuration`, `acceptJobResult`) calls
  `assertWorkerDepartmentAccess(allowedDepartmentIds, job.departmentId)` before touching a
  specific Job id — `not_found` (404), **never** `forbidden` (403), matching every other
  cross-department access pattern in this codebase. Do not add a Department check that
  returns 403 for this, and do not skip the check because "the claim query already
  filtered" — every operation re-checks independently.
- **The Worker never becomes an `Actor` and is never authenticated via the dashboard
  session.** `claimNextJob`, `updateJobProgress`, `updateJobDuration`, `transitionJob`,
  `getJobForWorker`, and `getFileForWorkerServing` all take **no `Actor` parameter** —
  keep it that way; do not thread a fake/system `Actor` through them "for consistency."
  (They now take `allowedDepartmentIds: string[]` where Department-scoped — that is not
  an `Actor` and must not be treated like one.)
- **`WorkerApiKey` management (create/revoke/reactivate/edit-Department-scope) is
  ADMIN-only** (`worker_key:manage`) at `/worker-keys` — see
  [`docs/integrations/worker-api.md`](docs/integrations/worker-api.md) §3a. The raw
  secret is shown exactly once, at creation, never re-displayed or stored anywhere
  retrievable. **`WORKER_API_KEY` no longer exists** — removed from `@/server/env`
  entirely, no fallback path. Do not reintroduce a shared static key without a new ADR.
- **`/api/files/[fileId]` has three, not two, request paths (ADR-0043)**: an
  `Authorization` header present means "authenticate as the Worker, unscoped by
  Department, or reject" — never falls back to session or unauthenticated serving. No
  header, with a valid session, serves through the original Department-scoped path.
  No header **and no session** falls to `getFileForUnauthenticatedWorkerDownload` —
  the real Worker's asset/Template downloader sends no credential at all, so this is
  the one real way its downloads succeed; it is bounded to a File that is a genuine
  input of a currently-`QUEUED`/`CLAIMED`/`RENDERING` Job, never an arbitrary Gallery
  File. Do not blur these into a single combined check, and do not widen the third
  path's scope without re-reading `docs/integrations/worker-api.md` §5 first.
- **The claim/get-by-id payload keeps legacy's exact field names**
  (`output`/`title`/`composition`/`template`/`assets[].{composition,layer,type,src,text}`)
  — only add fields, never rename or remove one without a compatibility review.
  `PATCH .../state` must keep accepting both a legacy integer (0–9) and a Studio state
  name (`mapWorkerState`). **A same-state call is a no-op, not an error (ADR-0043)** —
  the real Worker reports 3 legacy codes that all map to `RENDERING`; only
  `transitionJobForWorker` (the Worker-facing adapter) special-cases this, the general
  state machine's no-self-loop invariant is unchanged for every other caller.
- **`assets[].src`/Template download URLs are relative paths (`/api/files/{id}`), never
  absolute (ADR-0043).** The real Worker's downloader only resolves a **path** joined
  onto its own configured base URL — an absolute URL breaks it outright (verified by
  hand). `buildFileUrlFromRequest` (`src/app/api/v1/worker/_lib/build-file-url.ts`)
  returns a relative path; do not change it back without re-reading ADR-0043.
- **The empty-queue response is `404` with the message `"Not Found"` (verbatim),
  never `204` (ADR-0043 — reverses the originally shipped, never-Worker-verified
  design).** The real Worker's error-suppression only recognizes a response whose body
  contains that exact substring; a `204` (no body) gets logged as a spurious error on
  every empty poll. Do not change this message text or revert to `204` without
  re-reading ADR-0043 and the real Worker's `renderer.go`.
- **Result/output upload is implemented, Phase 9; path and body format corrected
  Phase 14 (ADR-0043).** `POST /api/v1/worker/jobs/:id/upload` (**not** `.../result` —
  renamed to match the real Worker's actual path) is `multipart/form-data` with the
  video under form field `"file"` (**not** raw bytes — the real Worker's `UploadJob`
  sends real multipart) — the handler reads `request.formData()`. **No Worker
  credential is required for this specific route (ADR-0043)** — the real Worker sends
  none; `authenticateWorkerLenient` (not `authenticateWorker`) is used, and
  `acceptJobResult` accepts `allowedDepartmentIds: null`, gated instead by the Job's
  own render state (`RENDERING`, or `RENDERED` with no `videoFileId` yet — the real
  Worker calls `ChangeState(Rendered)` before uploading). Do not add multipart parsing
  to `defineRouteHandler` itself for this — the handler reads the body directly, same
  pattern as before.
- **`PATCH .../duration`'s wire field name is `duration`, not `durationSeconds`
  (ADR-0043)** — the real Worker's `SetDuration()` sends `{"duration": <int>}`. Studio's
  internal domain field stays `Job.durationSeconds`; this route is the one place the
  translation happens. Do not "fix" this back to `durationSeconds` at the wire boundary.
- **`GET {origin}/jobs/:id` (no `/api` prefix) is real, ADR-0043** — the actual Worker's
  mid-render cancellation poll (`worker.go`'s `CanCancel`) hits this literal,
  unauthenticated URL, expecting the legacy `{"job":{"_id":...,"state":...}}` shape.
  Since that URL is already the dashboard's Job detail page, `src/middleware.ts`
  content-negotiates the two apart (Worker: no `Accept: text/html`) and rewrites only
  the Worker's request to `src/app/api/internal/legacy-job-status/[jobId]/route.ts`.
  This is routing, not authorization — it does not violate "no authorization in
  middleware" (§5's dashboard session check is still the only authorization gate for
  every request middleware does not rewrite). Do not add unrelated logic to
  `middleware.ts` — it exists for this one literal path collision.
- **Not implemented, deliberately**: Worker-initiated cancel/retry (the cancel _signal_
  above is Worker→Studio informational polling, not a Worker-initiated action), per-Worker
  rate limiting, a Worker input-file-upload endpoint (`POST /api/v1/worker/files`). Do not
  add any of these without re-reading `docs/integrations/worker-api.md` §6 first.

## 14. Telegram rules (summary)

Full detail: [`docs/integrations/telegram.md`](docs/integrations/telegram.md),
[`docs/architecture/decisions.md`](docs/architecture/decisions.md)
ADR-0035/0036/0037/0038. **Implemented, Phase 8** — webhook transport
(`app/api/telegram/webhook`), phone-based identity linking, durable wizard state, and
Single Track/Album/List/Retry/Cancel/Cancel-All flows.

- **Telegram is an adapter, never a second Job/Template/File implementation.** The
  composer (`features/telegram/bot/composer.ts`) maps updates to use-case calls and
  renders replies — it never decides authorization, Template/Job state, or validation
  itself. Every one of those checks lives in the same use case a dashboard Server Action
  calls (`createJob`, `getTemplateForJobForm`, `cancelJob`, `retryJob`,
  `listDepartmentJobs`, `uploadFile`) — **imported directly by the Telegram feature**,
  the one deliberate exception to "a use case never imports another feature's use cases"
  (see `docs/architecture/project-structure.md` §3). Do not add a Telegram-only variant
  of any Job/Template/File rule; extend the shared use case instead.
- **No Telegram-specific authorization function.** Every handler resolves an `Actor`
  (`resolveTelegramIdentity`) and calls the exact same `authorize()`-gated use case a
  human would reach — never a `telegramCanCreateJob()`-style parallel check. An unlinked
  Telegram user, or one linked to a since-`DISABLED` User, resolves to no `Actor` at all
  and is shown the linking prompt.
- **Identity linking is phone-based and unique** (`User.phone`/`User.telegramUserId`,
  both `@unique` — ADR-0036). Only a **self**-shared Telegram contact can link an
  account; a forwarded contact card can never link someone else's phone. Setting
  `User.phone` in the first place is Users-feature scope, not Telegram-feature scope —
  there is no phone-editing UI yet (`prisma db seed`'s `SEED_ADMIN_PHONE` only).
- **Conversation state is durable, never in-memory.** `TelegramWizardState`
  (`features/telegram/repository/telegram-repository.ts`) is the only place a
  conversation's progress lives — the composer itself holds nothing between requests.
  Every step change is one atomic conditional `UPDATE ... WHERE step IN (fromSteps)`
  (`advanceWizardState`), the same primitive `transitionJobRow` uses for `Job.state` —
  never a read-then-write. Expiration is lazy (checked on next read against
  `TELEGRAM_WIZARD_TTL_MINUTES`), not a scheduled sweep.
- **Every callback id is re-validated server-side, every time** — `decodeCallbackData`
  only parses shape; the use case it reaches re-resolves the id through the actor's own
  department scope. Never trust a callback just because Studio generated the button, and
  never put anything sensitive in `callback_data`.
- **A Telegram-collected file is an ordinary `GALLERY_ASSET`**, uploaded through the
  unmodified `uploadFile` use case (real content-type sniffing, never Telegram's declared
  media type) — there is no separate temporary-upload/`JOB_ARTIFACT`-on-input concept to
  build or clean up (ADR-0038).
- **`TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` are optional** — Studio must run
  fully with Telegram unconfigured, unlike Worker authentication, which is always
  mandatory (a `WorkerApiKey` must exist and be `ACTIVE`, ADR-0040). The webhook
  (`@/server/telegram-webhook-auth`) fails closed (`503`) when unconfigured, `401` on a
  missing/wrong secret — never an open, unauthenticated endpoint.
- **One Telegraf instance per process** (`@/server/adapters/telegram/client.ts`'s
  `getTelegramBot()`, `globalThis`-cached like `@/server/db`); handlers are attached to it
  exactly once (`features/telegram/bot/register.ts`). Never construct a second `Telegraf`
  instance or re-run `bot.use(telegramComposer)`.
- **Not implemented, deliberately**: `deliverToTelegram` as a Job field (Phase 9 resolved
  this as "no flag — automatic, best-effort" instead, see §15), aspect-ratio validation
  (matches the dashboard — OD-14 stays open), any Template-authoring surface via
  Telegram, a self-service phone-editing UI.

## 15. Rendered-result & notification rules (summary)

Full detail: [`docs/domain/jobs.md`](docs/domain/jobs.md) "Rendered result",
[`docs/architecture/decisions.md`](docs/architecture/decisions.md) ADR-0039/ADR-0041.
**Implemented, Phase 9** — `POST /api/v1/worker/jobs/:id/result`, `ffmpeg`-based artifact
generation. **YouTube delivery removed, Phase 12 (ADR-0041)** — Studio does not upload
rendered Jobs to YouTube (or anywhere else); `RENDERED` is the Job's final state.

- **`accept-job-result.ts` is the one and only handler for a Worker's rendered result,
  and it does not deliver anywhere.** It generates artifacts, atomically transitions
  `RENDERING -> RENDERED` together with the three artifact File ids, sends one
  best-effort "rendered" Telegram notification, and returns. There is no delivery
  orchestrator, no queue, no external API call from this path. Do not reintroduce one
  without a new ADR.
- **`ffmpeg` only — never add ImageMagick/`convert`.** `server/adapters/media/
ffmpeg-adapter.ts` is the only module that shells out for media processing, always via
  `execFile` with a fixed argument array, never `shell: true`, never a template-built
  command string. Never add a second media-processing binary without a new ADR revisiting
  ADR-0039's reasoning.
- **Telegram notification is best-effort, never able to fail or block a Job.**
  `sendJobNotification` (`features/delivery/infrastructure/telegram/
telegram-delivery-adapter.ts`) logs a failed send and moves on — never retried, never
  surfaced to the Worker. There is no `DeliveryAttempt` model anymore (removed,
  ADR-0041) — do not reintroduce a durable delivery ledger without a real requirement.
- **A `JOB_ARTIFACT` File is never deletable through the ordinary Gallery delete
  action, for any role, including ADMIN.** `assertCanDeleteFile` refuses it explicitly.
  Its only deletion path is `features/delivery/use-cases/cleanup-job-artifacts.ts`
  (eligible once a Job reaches `RENDERED`), which is safe and idempotent. Do not add a
  second deletion path for it.
- **No YouTube feature exists at all — `features/youtube/`, `server/adapters/youtube/`,
  `YouTubeTarget`, `youtube:manage`, `Template.youtubeTargetId`/`description`/`tags`,
  `Job.deliverToYouTube`, the daily upload quota, and `JobState.DELIVERING`/`UPLOADED`
  were all removed (ADR-0041).** Do not reintroduce any of them, or a generic "delivery
  provider" abstraction anticipating a future one, without an explicit new product
  decision and a new ADR.
- **Not implemented, deliberately**: automatic/scheduled artifact cleanup (the primitive
  exists, nothing calls it — OD-18), any background-job/queue infrastructure (BullMQ,
  pg-boss, a cron sweep — OD-40 stays open for the pieces this phase didn't need one
  for), a dashboard in-app notification center (Telegram DM is the only completion
  notification that exists), any external delivery destination for a rendered result.

## 16. Security rules (summary)

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

## 17. Frontend conventions (summary)

Panel-only app, **no landing page**. Next.js App Router + React + TypeScript + Tailwind +
shadcn/ui. **LTR**, **English** UI and messages. Responsive with an excellent mobile
experience. **Light / Dark / System** themes. Full detail:
[`docs/frontend/conventions.md`](docs/frontend/conventions.md).

## 18. Phase status

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
  hidden from nav.
- **Phase 4 (File Gallery & storage lifecycle) — complete.** `File` model (hard-deleted
  when safe, never soft-deleted — ADR-0025), a swappable `StorageAdapter` with a local-disk
  implementation (ADR-0024), real content-type sniffing and per-kind size limits
  (ADR-0026), a working upload/browse/search/preview/delete Gallery UI, and the
  historical-integrity contract a future Job/Template feature must follow.
- **Phase 5 (Template management) — complete.** `Template`/`TemplateAsset` models
  (soft-delete independent of enabled/disabled state — ADR-0006; name uniqueness per
  Department among non-deleted rows via a hand-added partial index, zero-asset Templates
  allowed, and an optional department-verified, deletion-protected asset-level default
  File reference — all ADR-0027, resolving OD-09/OD-10/OD-11); `template:manage`
  (MANAGER+) / `template:view` (USER+) authorization, confirmed against OD-04; a full
  create/list/search/filter/edit/enable-disable/soft-delete UI; and the documented (not
  yet enforceable — no Job feature exists) Template/Job contract for Phase 6.
- **Phase 6 (Job management & state machine) — complete.** `Job`/`JobAsset` models —
  historical snapshot split across immutable JSONB (`Job.snapshot`, Template-level
  fields) and relational rows (`JobAsset`, resolved values with copied File metadata,
  ADR-0028); an explicit, validated 8-state state machine with every transition written
  through one atomic conditional `UPDATE` (ADR-0029); an atomic `SELECT ... FOR UPDATE
SKIP LOCKED` Worker claim (manually verified race-free); a global, UTC-day upload
  quota enforced via a Postgres advisory lock (ADR-0030); non-destructive retry that
  copies the original's snapshot/assets verbatim (ADR-0031, resolves OD-02); `job:manage`
  resolved as whole-department for USER (resolves OD-03 for Jobs); the real
  `assertNoActiveJobDependencies` File-dependency check (closing the loop ADR-0025
  opened in Phase 4); and a create/list/filter/detail/cancel/retry UI.
- **Phase 7 (Worker REST API) — complete.** `/api/v1/worker/{jobs/next, jobs/:id,
jobs/:id/state, jobs/:id/progress, jobs/:id/duration}` — thin `defineRouteHandler`
  wrappers over Phase 6's use cases, nothing more (ADR-0033); a single shared static
  `WORKER_API_KEY` (required env var, timing-safe `Authorization: Bearer` check, no
  database model — ADR-0032, resolves OD-27); the Worker's trust model documented
  honestly as one global, non-departmental principal (ADR-0034, resolves OD-30);
  `/api/files/[fileId]` extended with a second, Worker-authenticated path so the Worker
  can download input Files by the URL its own Job payload gives it; every repeated-
  request/concurrency guarantee (claim, state transition) verified safe with real
  concurrent HTTP requests against the real database, no new idempotency-key mechanism
  needed (ADR-0034). No Worker rendering, FFmpeg/ImageMagick, result/output upload,
  `JOB_ARTIFACT` creation, Telegram, or YouTube delivery — those remain later phases.
  The app runs (`npm run dev`), builds (`npm run build`), and passes `npm run check`
  (lint + typecheck + format + tests).
- **Phase 8 (Telegram Bot integration) — complete.** Webhook transport (`telegraf`,
  `POST /api/telegram/webhook`, ADR-0035), a single `globalThis`-cached bot instance with
  handlers attached exactly once; phone-based identity linking with `User.phone`/
  `User.telegramUserId` (both new `@unique` columns, ADR-0036, resolves OD-06); durable,
  lazily-TTL'd `TelegramWizardState` conversation rows with atomic-conditional-update
  duplicate protection (ADR-0037, resolves OD-12/OD-35); Single Track, Album (redesigned
  onto Studio's typed Template model, not legacy's schema-free hack), List/Retry/Cancel,
  and a department-scoped Cancel All (the direct fix for a real legacy authorization bug)
  — every flow calling the **unmodified** Phase 5–7 use cases (`createJob`, `getJob`,
  `retryJob`, `cancelJob`, `listDepartmentJobs`, `getTemplateForJobForm`, `uploadFile`),
  adding no parallel Job/Template/File logic (ADR-0038). Telegram-collected files are
  ordinary Gallery assets — no new temporary-upload lifecycle. `npm run check` and
  `npm run build` both pass. **Not implemented, deliberately**: aspect-ratio validation
  (matches the dashboard), any Telegram Template-authoring surface, a self-service
  phone-editing UI. **Still no user/department management UI, no result upload, no
  YouTube.**
- **Phase 9 (Media processing & delivery) — complete.** `POST
/api/v1/worker/jobs/:id/result` accepts the Worker's rendered result as raw bytes
  (`acceptJobResult`, idempotent against duplicate/racing requests); `ffmpeg`-only media
  processing (`server/adapters/media/ffmpeg-adapter.ts`, ADR-0039 — ImageMagick
  deliberately not migrated) generates a screenshot + thumbnail and creates the first real
  `JOB_ARTIFACT` Files (`Job.videoFileId`/`screenshotFileId`/`thumbnailFileId`); a
  synchronous, awaited Delivery Orchestrator (`features/delivery/use-cases/
deliver-job-result.ts`) drives `RENDERED -> DELIVERING -> UPLOADED`/`ERROR` through the
  unmodified Phase 6 state machine, recording durable `DeliveryAttempt` rows (`PENDING`
  before every external call) and sending best-effort Telegram notifications (resolving
  the notification half of OD-40); `YouTubeTarget` (department-scoped, ADR-0039 resolves
  OD-36) connects via a verified refresh-token entry rather than a full OAuth
  consent-screen flow, with tokens encrypted at rest (AES-256-GCM); Template↔Target
  wiring with server-side verification (`verify-youtube-target.ts`) and Job-creation-time
  enforcement; tag substitution (`{{layer}}`, matching legacy, `excludeTags` not
  reproduced); a delivery-only retry (`retryJobDelivery`, resolves OD-13) via a
  deliberately narrow `ERROR -> DELIVERING` escape hatch (`transitionJobRow` called
  directly, not added to the general state graph); an idempotent, reference-aware
  `cleanupJobArtifacts` primitive (not yet auto-triggered — OD-18 stays open); a `/youtube`
  management page and Job-detail delivery/retry UI. `npm run check` and `npm run build`
  both pass; a real end-to-end verification (real Postgres, real `ffmpeg`, a genuinely
  generated test video) additionally exercised idempotency, the concurrency race, and
  cleanup. **Not implemented, deliberately**: a self-service OAuth consent-screen UI,
  per-target upload quota, automatic/scheduled artifact cleanup, any background-job/queue
  infrastructure, a dashboard in-app notification center, configurable YouTube privacy.
  **Still no user/department management UI.**
- **Phase 10 (UI completion, testing & production hardening) — complete.**
  Users (`/users`, `/users/new`) and Departments (`/departments`) — the last two
  placeholder pages — are now real: create/list/disable-enable/ADMIN-only role-change for
  Users (wiring Phase 3's already-tested `authorize-user-management.ts` policy to real
  repository mutations for the first time — no policy changes, only wiring), create/
  rename for Departments (ADMIN-only; deliberately **no** delete/archive path — OD-07
  stays open, `docs/domain/departments.md`). Both department-scoped consistently with
  every other feature (`findUserInScope` folds cross-department into `not_found`, never
  `forbidden`). A full security/architecture audit found and fixed two real defects: the
  Worker's result-upload endpoint buffered an oversized body fully into memory before
  its size check (now rejected via `Content-Length` first, `docs/security/security.md`
  §6); the dashboard's Overview page and its "Soon" sidebar badge were stale Phase 1
  placeholder copy describing already-shipped features as "planned" (rewritten; the
  now-fully-dead `PlaceholderPage` component was removed). Everything else audited —
  shell execution (`execFile`-only, no `shell: true`, confirmed by grep), path traversal
  (`LocalStorageAdapter`'s root-containment check), disabled-user session enforcement
  (`status !== "ACTIVE"` checked on every session read), cross-department isolation
  (every list/detail use case), Worker/Telegram/Delivery authentication boundaries — was
  already correct from Phases 1–9's own rigor; **no other regressions found**. 32 new
  tests (23 unit + a real end-to-end run against Postgres covering department creation,
  duplicate-name/duplicate-email conflicts, MANAGER-cannot-create-MANAGER,
  cross-department 404, self-lockout, idempotent status/role changes, and department-
  scoped listing). `npm run check` and `npm run build` both pass.
- **Phase 11 (Department UX, Worker API Key scoping, YouTube Department many-to-many,
  Template Department transfer) — complete (ADR-0040).** `/departments`, `/youtube`, and
  the new `/worker-keys` nav items/pages moved to ADMIN-only (a non-ADMIN still sees
  their own Department's name via `CurrentUser.departmentName` in the sidebar, without
  the management page); `WorkerApiKey` (hashed secret, `ACTIVE`/`REVOKED`,
  many-to-many Department scope, ADMIN CRUD at `/worker-keys`, secret shown once)
  entirely replaces the single static `WORKER_API_KEY` env var — every Worker Job
  operation now derives its Department scope server-side from the authenticated key,
  with the atomic claim query itself filtering by that scope (never a post-hoc check);
  `YouTubeTarget.departmentId` (single FK) became `departments` (many-to-many),
  `youtube:manage` moved to ADMIN-only (was `MANAGER+`); ADMIN can transfer a Template to
  a different Department on edit (MANAGER/USER cannot, even via a crafted request),
  re-verifying dependent File/YouTube references against the target Department, needing
  no new historical-integrity mechanism since `Job.departmentId` was already a plain
  column copied at Job creation, never a live join. Real end-to-end HTTP verification
  against Postgres confirmed the Department-scoped atomic claim, cross-department
  `404`-never-`403` enforcement, and progress/duration/state scope checks. `npm run
check`/`npm run build` both pass.
- **Phase 12 (Remove YouTube upload; simplify Job lifecycle) — complete (ADR-0041).**
  Explicit product decision: Studio does not upload rendered Jobs to YouTube at this
  stage. Removed entirely — database (`YouTubeTarget`, `DeliveryAttempt`,
  `Template.youtubeTargetId`/`description`/`tags`, `Job.deliverToYouTube`/`deliveredAt`/
  `uploadedAt`, `JobState.DELIVERING`/`UPLOADED`, the daily upload quota and its
  advisory-lock logic, `TelegramWizardStep.ASK_DELIVERY`), application code
  (`features/youtube/`, `server/adapters/youtube/`, `deliver-job-result.ts`,
  `retry-job-delivery.ts`, `tag-substitution.ts`, `delivery-repository.ts`), UI
  (`/youtube` nav item/page, the Job detail "Delivery" card, the Template YouTube-channel
  picker, the Job-create "deliver to YouTube?" checkbox), the `youtube:manage`
  authorization capability, the `googleapis` dependency, and
  `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/`YOUTUBE_TOKEN_ENCRYPTION_KEY`. A real
  Prisma migration dropped the corresponding tables/columns/enum values, verified empty
  beforehand in every environment checked (zero data loss). `RENDERED` is now the Job's
  terminal, successful completion state — `POST /api/v1/worker/jobs/:id/result` still
  accepts the Worker's rendered bytes (unchanged shape) and generates the same
  `ffmpeg`-based screenshot/thumbnail artifacts, but now only sends a best-effort
  "rendered" Telegram notification afterward, never an external delivery call. Legacy
  Worker state codes `6`/`7` (Uploading/Uploaded) are no longer mapped — rejected `422`.
  Single Track's Telegram flow no longer asks "deliver to YouTube?" — it opens straight
  into asset collection. Real end-to-end HTTP verification against Postgres (including a
  genuine `ffmpeg`-generated test video) confirmed the full Worker flow reaches
  `RENDERED` directly with no YouTube API call of any kind. `npm run check`/`npm run
build` both pass; `npm install` succeeds cleanly after the `googleapis` removal.
- **Phase 13 (UI/API/Template/File-picker hardening) — complete (ADR-0042).** Dark
  Mode's native `<select>`/form-control chrome fixed at the root cause — a two-line
  `color-scheme: light`/`color-scheme: dark` CSS addition (`src/app/globals.css`), not a
  component rewrite; every Radix overlay (`DropdownMenu`, `Sheet`) was already correctly
  token-driven. The Worker REST API moved from `/api/worker/v1/...` to
  `/api/v1/worker/...` (a real directory move, not a redirect) — establishing
  `/api/v{version}/{service-or-resource}/...` as the versioning convention going
  forward; every reference across routes, `worker-auth`, docs, and tests was updated,
  with no backward-compatible old route kept (the Worker is in-repo and was updated
  directly). Template Edit is now **structurally** incapable of changing a Template's
  Department — `templateInputSchema` has no `departmentId` field, so a client-submitted
  one is stripped by Zod before `updateTemplate` ever runs, and the use case/repository
  layer never reads or writes one either; Department transfer became its own
  ADMIN-only operation (`transferTemplateDepartment`, its own schema/action/repository
  function), rendered as a separate control, never inside the edit form (see §10 above,
  `docs/domain/templates.md` "Department transfer"). Job asset File selection for
  `IMAGE`/`AUDIO`/`VIDEO` slots is now a visual `FilePicker`
  (`features/files/components/file-picker.tsx`) — thumbnails, live filename search, and
  inline upload — built entirely on the existing File Gallery/upload architecture
  (`searchGalleryFilesAction`/`uploadFileAction`, no new storage or media pipeline); a
  freshly uploaded file is auto-selected immediately. Every existing Department-isolation
  guarantee is unchanged: the picker's own department narrowing is advisory/UX only,
  and `features/jobs/use-cases/resolve-job-assets.ts` still re-validates every submitted
  `fileId` against the Template's Department server-side, exactly as before. 446 tests
  pass; `npm run check`/`npm run build` both pass.
- **Phase 14 (Worker compatibility audit — real Worker source as source of truth) —
  complete (ADR-0043).** Every prior phase's Worker REST API design was built and
  documented **without ever reading the actual Worker's real source
  (`navaak-ae-renderer`, external repository)** — this phase did, in full, and fixed
  every concrete defect that comparison found; the Worker itself was never modified
  (verified via `git status` before and after — its own pre-existing, unrelated
  uncommitted local changes were left untouched). Findings, most severe first: (1) the
  render pipeline could never complete a single real render — the real Worker reports
  3 legacy per-stage codes (Downloading/Started/InProgress) that all map to Studio's
  `RENDERING`, and the state machine's deliberate no-self-loop rule rejected the second
  and third as illegal transitions every time — fixed by making the Worker-facing
  `transitionJobForWorker` treat a same-state report as an idempotent no-op, leaving
  the general state machine's invariant untouched for every other caller; (2) the
  result upload could never succeed — wrong path (`.../result` vs. the real Worker's
  `.../upload`), wrong body format (raw bytes vs. the real Worker's actual
  `multipart/form-data`, field `"file"`), and a required-`RENDERING` state check that
  the real Worker's own call order (`ChangeState(Rendered)` sent _before_ uploading)
  defeats — all three fixed; (3) every asset/Template download was broken — the
  claim/get-by-id payload returned an absolute URL, but the real Worker's downloader
  only resolves a relative path joined onto its own base URL, corrupting the request
  otherwise (verified by hand) — fixed; (4) the empty-queue response (`204`) was
  logged as a spurious error on every poll, since the real Worker's error-suppression
  only recognizes a `404` body containing the literal text `"Not Found"` — reverted to
  `404`; (5) every duration report was rejected — the real Worker sends `{"duration":
...}`, not `{"durationSeconds": ...}` — fixed at the route boundary only, Studio's
  internal domain field name is unchanged; (6) the real Worker's mid-render
  cancellation poll (`GET {baseURL}/jobs/:id`, unauthenticated, legacy
  `{"job":{"_id",...}}` shape) had no Studio counterpart at all and collides with the
  dashboard's own Job detail page URL — added via a new, narrowly-scoped
  `src/middleware.ts` performing a pure content-negotiation rewrite (never an
  authorization decision) to a new internal Route Handler. Three real Worker calls
  (result upload, asset/Template download, the cancel poll) send **no credential of
  any kind** in the real Worker's actual code — each gained an explained, bounded
  compensating check instead of either breaking the call outright or opening the
  underlying endpoint with no scope at all (see ADR-0043 and
  `docs/integrations/worker-api.md` for the exact, per-endpoint trade-off). 473 tests
  pass (27 new/rewritten); `npm run check`/`npm run build` both pass; the middleware
  rewrite and the empty-queue/file-serving fixes were additionally verified against a
  running dev server with real HTTP requests, not just unit tests.

Do not start a new phase beyond this unless explicitly asked — see
[`docs/development/workflow.md`](docs/development/workflow.md) for the full history
and [`docs/development/open-decisions.md`](docs/development/open-decisions.md) for what
remains genuinely undecided (not a backlog to silently resolve).

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
