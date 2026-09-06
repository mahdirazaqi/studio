# Development Workflow

## Phases

Studio is built in phases. **Do not run ahead of the current phase.**

### Phase 0 — Documentation & architecture foundation _(complete)_

**Goal:** a complete, consistent, AI-readable knowledge base so future work does not
re-derive the architecture or re-introduce legacy defects.

**In scope:** everything under `docs/`, `CLAUDE.md`, `README.md`.

**Explicitly NOT in scope (Phase 0 non-goals):**

- No full UI implementation — no Job UI, Template UI, File Gallery UI, Users UI,
  Departments UI.
- No Telegram bot implementation.
- No Render Worker API implementation.
- No YouTube integration implementation.
- No authentication/session implementation.
- No production `prisma/schema.prisma` or migrations (conceptual model only).
- No Prisma models, API endpoints, Server Actions, use cases, or adapters — **unless**
  strictly required to validate a documented decision.
- No production deployment.
- No new features beyond the documented domain.
- No redesign of business behavior without an explicit requirement.
- No migration or copying of legacy code.

**Definition of done for Phase 0:**

- [x] Legacy repo inspected directly (not just via the analysis doc).
- [x] Legacy `src/render` behavior understood and documented (`legacy/`).
- [x] Legacy technical debt catalogued (`legacy/known-issues.md`, K1–K28).
- [x] Studio architecture documented (`architecture/`).
- [x] Server Actions vs REST boundary documented (`architecture/boundaries.md`).
- [x] Roles & permission matrix documented (`domain/authorization.md`).
- [x] Department isolation documented (`domain/departments.md`, ADR-0011).
- [x] Job lifecycle & state machine documented (`domain/jobs.md`, ADR-0013).
- [x] Job "never deleted" documented (ADR-0005).
- [x] Template soft-delete documented (ADR-0006).
- [x] User disable (never delete) documented (ADR-0007).
- [x] File hard-delete rules + Gallery vs Artifact documented (ADR-0008).
- [x] Historical integrity + snapshot strategy documented (`data/historical-integrity.md`, ADR-0009/0010).
- [x] Non-destructive retry redesigned conceptually (`domain/jobs.md`).
- [x] Worker REST compatibility + auth requirement documented (`integrations/worker-api.md`).
- [x] Telegram integration + durable state documented (`integrations/telegram.md`, ADR-0014).
- [x] Security requirements documented (`security/security.md`).
- [x] Frontend conventions documented (`frontend/conventions.md`).
- [x] ADRs written (`architecture/decisions.md`).
- [x] Legacy → Studio mapping written (`legacy/legacy-vs-studio.md`).
- [x] Compatibility matrix written (`legacy/compatibility-matrix.md`).
- [x] `CLAUDE.md` created.
- [x] OPEN DECISION items collected (`development/open-decisions.md`).

### Phase 1 — Next.js foundation & application architecture _(complete)_

**Goal:** a clean, production-ready application skeleton — no business features.

**Delivered:**

- Next.js 15 App Router + TypeScript (strict) + Tailwind v4 + shadcn/ui, on npm.
- Theme system (Light / Dark / System) via next-themes + token-driven `globals.css`.
- Dashboard shell: `(auth)` + `(dashboard)` route groups, collapsible sidebar, header
  with breadcrumb + theme toggle, mobile off-canvas nav, placeholder feature routes.
- Feature-based structure (`src/features/*` with README-documented scope).
- Server/infra layer (`src/server/*`, all `server-only`): validated env, structured
  logger + redaction, `AppError` model + `toPublicError`, `parseInput` validation,
  `defineAction` (Server Actions), `defineRouteHandler` (REST), auth boundary
  (`getCurrentUser`), authz boundary (`authorize`).
- Error/loading/not-found boundaries at root, `(dashboard)`, and global levels.
- ESLint server/client boundary guard, Prettier, Vitest (37 foundational tests),
  `npm run check`.
- `/api/health` — the only Route Handler.

**Explicitly NOT in Phase 1:** any domain feature (Jobs/Templates/Files/Users/
Departments/Telegram/Worker/YouTube), Prisma schema/models/migrations, the session
backend, real forms, deployment.

**Docs:** `architecture/{project-structure,tech-stack,server-actions,rest-architecture,
server-client-boundary,authentication-boundary,error-handling,environment,logging}.md`,
`frontend/theme.md`, ADR-0017/0018/0019.

### Phase 2 — Database & authentication _(complete)_

**Goal:** a real persistent data layer and real authenticated sessions — no full
authorization matrix, no user/department management UI yet.

**Delivered:**

- PostgreSQL + Prisma (`prisma/schema.prisma`, `src/server/db` singleton,
  `DATABASE_URL` required in `@/server/env`, initial migration applied and verified
  against a real Postgres instance). ADR-0002 (already decided) now has code behind it.
- `Department` (id, name, timestamps) and `User` (id, email, fullName, passwordHash, role,
  status, departmentId, timestamps) models. `User.departmentId` is `onDelete: Restrict` —
  Postgres refuses to delete a Department with Users, with no delete feature needed to
  enforce it.
- `Session` model + a custom, DB-backed session mechanism: opaque bearer token in an
  httpOnly cookie, only its SHA-256 hash stored server-side (ADR-0020 — resolves OD-43).
- bcrypt password hashing (`bcryptjs`), with a timing-safe path for unknown emails.
- Sign-in / sign-out: `features/auth` (schemas, use cases, Server Actions, a real sign-in
  form) on top of `@/server/auth/{session,password,current-user}`.
- `(dashboard)/layout.tsx` now genuinely protects every route under it
  (`getCurrentUser()` + `redirect`); the sidebar shows the real signed-in user and a
  working sign-out control; `(auth)/sign-in` redirects an already-authenticated visitor.
- Prisma seed (`prisma/seed.ts`, `npm run db:seed`) for a local dev Department + optional
  admin user, driven entirely by env vars — no hard-coded credential.
- ADR-0021 resolves OD-45 (Prisma naming: `@@map` tables to snake_case, columns default).
- Docs: `architecture/{database,authentication}.md`, `development/database.md`, and
  updates to `authentication-boundary.md`, `domain/{users,departments}.md`,
  `data/database.md`, `security/security.md`, `tech-stack.md`, `project-structure.md`.

**Explicitly NOT in Phase 2:** the full authorization matrix (`@/server/authz` still
allows ADMIN only, exactly as Phase 1 left it), department isolation enforcement, user
management (create/disable/role-change) or department management UI, Templates, Jobs,
Files, Worker API, Telegram, YouTube, rate limiting on login.

### Phase 3 — Authorization & department isolation _(complete)_

**Goal:** answer "what can this authenticated user do, and on which data" server-side,
everywhere — no user/department management UI yet, no Templates/Jobs/Files/Worker/
Telegram.

**Delivered:**

- `@/server/authz`'s capability registry (`authorize(actor, capability, {
departmentId? })`), replacing the Phase 1 ADMIN-only placeholder — role floor per
  capability, transcribed from the decided rows of `domain/authorization.md`'s permission
  matrix (ADR-0022).
- Department-scope tooling: `assertSameDepartment` (403, capability-level),
  `assertDepartmentScopeOrNotFound` (404, single-resource-instance level),
  `departmentScopeFilter(actor)` (query-level `where` fragment).
- User-management escalation/self-modification policy, prepared ahead of the actual
  feature: `src/features/users/use-cases/authorize-user-management.ts` — nobody changes
  their own role/status (including ADMIN), MANAGER is scoped to `USER`-role targets only,
  role changes are ADMIN-only pending OD-05, department reassignment is ADMIN-only
  (ADR-0023).
- `/users` (MANAGER+) and `/departments` (ADMIN-only) now check the actor's role
  server-side and render a real `ForbiddenPage` instead of their placeholder content when
  it isn't met — direct URL access is protected, not just the nav link.
- The Overview page's "Planned areas" list and the sidebar both filter to
  `navigationForRole(role)` (a Phase 1 leftover — the Overview page previously listed
  every route unfiltered — fixed as part of this phase's "navigation reflects
  permissions, but is never itself the security boundary" requirement).
- No middleware introduced — the existing layout-level session check already does the
  coarse job; fine-grained checks live in use cases/pages, documented in
  `architecture/authorization.md` "Why not middleware".
- Docs: `architecture/authorization.md`, `development/authorization.md`; updates to
  `domain/authorization.md`, `domain/users.md`, `security/security.md`,
  `open-decisions.md` (OD-03/04/05 annotated with their implemented conservative
  defaults; new OD-47 for a "last remaining ADMIN" bulk-operation safeguard).

**Explicitly NOT in Phase 3:** user/department management UI or mutating use cases (only
the authorization policy for them), Templates, Jobs, Files, Worker API, Telegram,
YouTube, rendering. **No database schema changes were required.**

### Phase 4 — File Gallery & storage lifecycle _(complete)_

**Goal:** the File domain — upload, catalog, browse, preview, and safe deletion of media
assets — plus the storage/historical-integrity infrastructure later Job/Template features
build on. No Template/Job/Worker/Telegram implementation.

**Delivered:**

- `File` model (`GALLERY_ASSET` | `JOB_ARTIFACT` category, `IMAGE`/`AUDIO`/`VIDEO` kind,
  department-scoped, hard-deleted when safe — never soft-deleted) — ADR-0024/0025/0026.
- `StorageAdapter` interface (`@/server/adapters/storage`) + a local-disk implementation;
  swappable for S3-compatible storage later without an application-layer change (OD-42's
  interface half resolved).
- Upload lifecycle: real content-type sniffing (`file-type`, never the client's declared
  MIME type), the exact legacy allow-list (JPG/PNG/WEBP/MP3/MP4) with new per-kind size
  limits (25/100/500 MB — resolves OD-21), image dimension probing, SHA-256 content
  hashing with an advisory (non-blocking) duplicate notice, and storage/database
  write-failure compensation (orphan cleanup on a failed DB write).
- Deletion: database row before storage bytes; a USER may delete only their own upload,
  MANAGER/ADMIN any file in scope; a documented (not-yet-real) Job-dependency hook
  (`assertNoActiveJobDependencies`) for the Jobs phase to fill in.
- `/api/files/[fileId]` — session-authenticated, department-scoped, byte-range-capable
  binary content delivery; a deliberate, narrow, documented exception to "no internal REST"
  (docs/architecture/boundaries.md).
- File Gallery UI: upload form (with an ADMIN-only cross-department picker), search +
  kind filter (URL-driven, server-scoped), responsive grid, image/audio/video preview,
  pagination, permission-aware delete control.
- The historical-integrity contract a future Job/Template feature must follow to keep a
  deleted File from ever breaking a historical record — written out concretely, not left
  as a Phase 0 intention (ADR-0025).
- Docs: `architecture/files.md`; updates to `domain/files.md`, `data/{lifecycle-rules,
historical-integrity,database}.md`, `security/security.md`, `architecture/{tech-stack,
boundaries,project-structure}.md`, `open-decisions.md` (OD-21 resolved; OD-19/20/42
  annotated).

**Explicitly NOT in Phase 4:** Template implementation, Job implementation, Worker REST
API, Telegram Bot, YouTube, rendering/transcoding (ffmpeg/ImageMagick), audio/video
duration probing, a real dedup/reuse UI, scheduled artifact cleanup (nothing produces a
`JOB_ARTIFACT` yet). **No new speculative tables** — `File` is the only addition.

### Phase 5 — Template management _(complete)_

**Goal:** the Template domain — authoring, listing/search, enable/disable, soft-delete,
asset-slot configuration with optional Gallery File defaults — plus the documented (not
yet enforceable) Template/Job contract later Job features build on. No Job/Worker/
Telegram/YouTube implementation.

**Delivered:**

- `Template`/`TemplateAsset` models — `status` (`ACTIVE`/`DISABLED`) and
  `deletedAt`/`deletedByUserId` as two independent axes (ADR-0006); `name` unique per
  Department among non-deleted rows via a hand-added partial DB index; zero-asset
  Templates allowed; an optional, department-verified, deletion-protected
  `defaultFileId` per `IMAGE`/`AUDIO`/`VIDEO` asset — all ADR-0027, resolving
  OD-09/OD-10/OD-11.
- Authorization: `template:manage` (MANAGER+) / `template:view` (USER+), confirmed
  against OD-04 with the product owner after the phase brief's own draft matrix
  contradicted the existing Phase 3 default — MANAGER+ authors, USER only views/lists
  their own department's Templates.
- `assertNoActiveTemplateDependencies` — a **real** File deletion-safety check (the
  direct, now-implemented sibling of Phase 4's still-documented-only
  `assertNoActiveJobDependencies`), blocking deletion of any File a Template asset
  currently defaults to.
- Full CRUD use cases (create/update/get/list/enable/disable/soft-delete), each
  authorizing first, then enforcing department scope, state-transition rules
  (idempotent enable/disable/delete; a soft-deleted Template can never be edited or
  re-enabled), and cross-department File-reference rejection.
- UI: list (search, status filter, pagination, role-aware actions), create/edit form
  (shared component, read-only for USER or a soft-deleted Template), and an asset editor
  (add/remove/reorder, per-kind field rules, Gallery File picker scoped to the Template's
  department).
- Docs: rewrote `domain/templates.md` Part B; updated `domain/authorization.md`,
  `domain/files.md`, `architecture/{authorization,files,project-structure,decisions}.md`,
  `data/{database,historical-integrity}.md`, `legacy/compatibility-matrix.md`,
  `open-decisions.md` (OD-09/10/11 resolved; OD-04 confirmed), `CLAUDE.md`.

**Explicitly NOT in Phase 5:** Job implementation (creation, snapshot, state machine),
Worker REST API, Telegram Bot, YouTube delivery, rendering/transcoding,
`youtubeTargetId` on Template (no `YouTubeTarget` table exists — would be speculative
schema), aspect-ratio tolerance comparison (OD-14 stays open; nothing yet accepts an
image against a Template slot), a Template version-history/restore mechanism.

### Phase 6 — Job management & state machine _(complete)_

**Goal:** the Job domain — creation, immutable historical snapshot, the state machine,
atomic Worker claim, progress/duration reporting, cancellation, non-destructive retry,
and the daily upload quota — as reusable application services plus a dashboard UI. No
Worker REST API, Telegram, YouTube delivery, or rendering.

**Delivered:**

- `Job`/`JobAsset` models. Historical snapshot split (ADR-0028): `Job.snapshot` (JSONB,
  Template-level fields) + `JobAsset` rows (resolved values, each with copied File
  metadata) — a relational model for assets per the phase's explicit requirement, not a
  single JSONB blob (resolves OD-16, OD-22's Job half).
- An 8-state, explicitly validated state machine (`QUEUED → CLAIMED → RENDERING →
RENDERED → DELIVERING → UPLOADED`, plus `ERROR`/`CANCELED` exits) — every write to
  `Job.state` goes through one atomic conditional `UPDATE` (ADR-0029), never a
  read-then-write.
- Atomic Worker claim (`SELECT ... FOR UPDATE SKIP LOCKED`) — manually verified
  race-free against the real database with concurrent calls.
- Non-destructive retry (ADR-0031): copies the original's snapshot/assets verbatim,
  never re-resolves the live Template/Files; eligible only from `ERROR`/`CANCELED`,
  within a configurable window (resolves OD-02).
- Global, UTC-day upload quota, concurrency-safe via a Postgres advisory transaction
  lock (ADR-0030) — a real bug (missing `::int` casts on the lock's arguments) was
  caught during manual verification and fixed.
- `job:manage` authorization resolved as whole-department for USER, not "own resources
  only" (resolves OD-03 for Jobs).
- The real `assertNoActiveJobDependencies` File-dependency check, closing the loop
  ADR-0025 opened in Phase 4 when no Job model existed yet.
- UI: list (search, state filter, pagination), create form (template picker → dynamic
  asset inputs, scoped Gallery File pickers), detail view (status, timeline, snapshot,
  assets, retry lineage), and cancel/retry actions.
- Docs: rewrote `domain/jobs.md` Part B; updated `domain/authorization.md`,
  `domain/files.md`, `architecture/{authorization,files,integrations/worker-api}.md`,
  `data/{database,lifecycle-rules,historical-integrity}.md`,
  `legacy/compatibility-matrix.md`, `open-decisions.md` (OD-02/16/22/26 resolved; OD-01/
  OD-03 partially resolved), `CLAUDE.md`.

**Explicitly NOT in Phase 6:** the Worker REST API, Worker authentication, Telegram Bot,
YouTube upload, FFmpeg/ImageMagick, rendering, a result-upload endpoint, `JOB_ARTIFACT`
creation, a Worker-timeout requeue sweep, bulk cancel, `deliverToTelegram` (no Telegram
linking mechanism exists on `User` yet), `youtubeTargetId` on Template (no
`YouTubeTarget` table exists).

### Phase 7+ (not started)

Sequencing is not finalized, but a sensible order:

1. User management (create/disable/role-change) + Department management — wires
   Phase 3's `authorize-user-management.ts` policy to real repositories/Server Actions/UI.
2. Worker API (atomic claim/progress/state/result over REST, service-credential auth;
   resolves OD-27, OD-28, OD-29) — wires Phase 6's `claimNextJob`/`updateJobProgress`/
   `updateJobDuration`/`transitionJob` application services to real HTTP endpoints, and
   Phase 6's `JOB_ARTIFACT` result-upload gap to real artifact creation.
3. YouTube delivery adapter.
4. Telegram adapter + durable wizard state.
5. Cleanup jobs, retention, hardening, observability (resolves OD-18, OD-20's remaining
   half, OD-31's requeue sweep).

Each Phase 7+ slice: read the relevant `docs/`, resolve the blocking OPEN DECISIONs with
the product owner, implement behind the layering rules, test (unit + the integration
tests listed in `conventions.md` §9), update the docs.

## Working on a task (any phase)

1. Read `CLAUDE.md` → the relevant `docs/` pages.
2. If legacy-derived, open the legacy source.
3. Check `open-decisions.md` — is anything you need still undecided? If it **blocks** you,
   ask; otherwise note it and proceed only on the parts that are decided.
4. Implement within the layer rules.
5. Add/adjust tests.
6. Update docs + ADRs + open-decisions.
7. Branch, commit, PR referencing the governing doc/ADR.

## Handling ambiguity

- Never invent a business requirement. Mark it `OPEN DECISION`, record the options **and
  their consequences**, add it to `open-decisions.md`, and ask when it blocks progress.
- Studio requirements > ADRs > Studio docs > legacy behavior > legacy implementation.
