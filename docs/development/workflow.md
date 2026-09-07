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

### Phase 7 — Worker REST API _(complete)_

**Goal:** expose Phase 6's Job application services to an external Worker over a small,
authenticated, versioned REST surface — a thin adapter layer, no new business logic.

**Delivered:**

- `WORKER_API_KEY` — a single, shared, required environment variable, checked with a
  timing-safe comparison (`@/server/worker-auth`) — resolves OD-27 (ADR-0032). No
  `WorkerCredential` table, no per-Worker identity, no rotation without a redeploy: a
  deliberate simplification, not an oversight. **Superseded, Phase 11 (ADR-0040):** a
  real `WorkerApiKey` table now exists — see that phase's own section below.
- `/api/worker/v1/jobs/next` (`POST`, atomic claim, `204` on an empty queue),
  `/api/worker/v1/jobs/:id` (`GET`), `.../state` / `.../progress` / `.../duration`
  (`PATCH`) — every handler a thin `defineRouteHandler` wrapper calling straight into
  Phase 6's use cases (`claimNextJob`, `getJobForWorker`, `transitionJob` via
  `transitionJobForWorker`, `updateJobProgress`, `updateJobDuration`). Resolves OD-28
  (versioning) and the empty-queue half of OD-29 (ADR-0033).
- `mapWorkerState` — accepts both a legacy integer (0–9) and a Studio state name on the
  state-update endpoint, exactly as `docs/integrations/worker-api.md` had already
  specified.
- The claim/get-by-id payload (`buildWorkerJobPayload`) keeps legacy's exact field
  names, built entirely from the Job's immutable snapshot/`JobAsset` rows.
- `/api/files/[fileId]` gained a second, Worker-authenticated path (unscoped by
  Department) so the Worker can download input Files by the URL its own Job payload
  provides — closing a gap no earlier phase addressed, since Studio's storage
  abstraction (ADR-0024) never hands out a raw filesystem path the way legacy did.
- The Worker's trust model (one shared, non-departmental principal — no per-claim
  ownership restriction) and repeated-request safety (claim/state/progress/duration all
  safe under retries via Phase 6's existing atomic primitives, no new idempotency-key
  mechanism) are both documented honestly rather than implying protections that don't
  exist (ADR-0034, resolves OD-30).
- Manually verified against a real database and a real server: authentication
  (missing/wrong/malformed credential), the full claim → progress → duration → state →
  terminal lifecycle (including the `ERROR` + `errorReason` path), invalid-transition
  rejection, a real concurrent-claim HTTP test (two simultaneous `POST` calls claim two
  different Jobs), Worker file download, and that dashboard session-based file access is
  completely unaffected.

**Explicitly NOT in Phase 7:** the result/output upload endpoint and `JOB_ARTIFACT`
creation (needs a screenshot/thumbnail pipeline that doesn't exist — a placeholder
endpoint storing nothing real was explicitly rejected as worse than not building it),
Worker-initiated cancel/retry (never part of the legacy Worker's REST contract), a
Worker file-upload endpoint, per-Worker-credential rate limiting (OD-41 stays open), a
Worker-timeout requeue sweep (OD-31 stays open), Telegram, YouTube delivery, rendering.

### Phase 8 — Telegram Bot integration _(complete)_

**Goal:** a conversational front-end for creating and monitoring Jobs, reusing the
Phase 5–7 application services verbatim — no second Job/Template/File implementation.

**Delivered:**

- Webhook transport (`telegraf`, `POST /api/telegram/webhook`, ADR-0035) — resolves
  OD-34. A single `globalThis`-cached bot instance; handlers attached exactly once.
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` are both optional (unlike
  `WORKER_API_KEY`) — Studio runs fully with Telegram unconfigured.
- Phone-based identity linking (`User.phone`/`User.telegramUserId`, both new `@unique`
  columns) — resolves OD-06 (ADR-0036): a phone match can never be ambiguous by
  construction, and only a self-shared Telegram contact can link an account.
- Durable `TelegramWizardState` conversation rows, lazily TTL'd (60 min default, no
  active sweep — OD-40 stays open) and protected against duplicate/racing Telegram
  updates by the same atomic-conditional-update primitive `Job.state` uses — resolves
  OD-12 (no Album grouping entity) and OD-35 (TTL length), ADR-0037.
- Single Track, Album (redesigned as N repetitions of Single Track's own per-slot
  collection loop, not legacy's schema-free asset-map splicing), List Jobs, Retry,
  Cancel, and a department-scoped Cancel All — the direct fix for a real legacy
  authorization bug (system-wide cancel). Every flow calls the **unmodified** Phase 6/7
  use cases; `cancelAllJobsForTelegram` is the one new piece of Telegram-side
  orchestration, and it composes the existing single-Job `cancelJob` in a loop rather
  than adding a Jobs-feature bulk-cancel capability.
- Telegram-collected files upload through the unmodified `upload-file.ts` and become
  ordinary Gallery assets — no new temporary-upload lifecycle, no Telegram-specific
  aspect-ratio check (matches the dashboard; OD-14 stays open) — ADR-0038.
- Manually verified against a real database (a standalone script exercising the real
  composer + use cases + repositories with a mocked Telegram Bot API): identity linking,
  both Single Track and Album job creation (including a real downloaded-and-sniffed
  image upload), list/detail/retry/cancel, Cancel All, `/cancel` mid-flow, and
  cross-department isolation (a tampered callback naming another department's Template
  is rejected). The webhook route's own auth boundary (missing/wrong secret →
  `401`) was verified against a real running server.

**Explicitly NOT in Phase 8:** outbound Job-lifecycle notifications (Rendered/Uploaded/
Error DMs — no trigger point exists since no real Worker/render pipeline runs yet, and no
durable delivery mechanism exists either, OD-40), `deliverToTelegram` as a Job field,
aspect-ratio validation, any Template-authoring surface via Telegram, a self-service
phone-editing UI (Users-feature scope, not built), YouTube delivery, rendering.

### Phase 9 — Media processing & delivery _(complete)_

**Goal:** complete the render pipeline `RENDERED -> Delivery -> UPLOADED`, wiring
Phase 4's `File.category = JOB_ARTIFACT` and Phase 6/7's `RENDERED`/`DELIVERING`/
`UPLOADED` states to a real, tested pipeline.

**Delivered:**

- `POST /api/worker/v1/jobs/:id/result` (raw video bytes, not multipart) —
  `accept-job-result.ts`, idempotent against duplicate/racing Worker requests via the
  same atomic conditional `UPDATE` pattern every other `Job.state` writer uses.
- `ffmpeg`-only media processing (`server/adapters/media/ffmpeg-adapter.ts`) — screenshot
  extraction (legacy's `00:00:04.000`, with a real fallback for a render shorter than
  that) + a resize filter for the thumbnail; ImageMagick deliberately not migrated
  (ADR-0039). Creates the first real `JOB_ARTIFACT` Files.
- A Delivery Orchestrator (`deliver-job-result.ts`) run **synchronously, awaited**
  inside the Worker's own request — the direct fix for legacy's fire-and-forget delivery.
  Telegram: best-effort notification (resolves the notification half of OD-40). YouTube:
  a required delivery when configured, recorded as a durable `DeliveryAttempt`
  (`PENDING` before the call), driving `RENDERED -> DELIVERING -> UPLOADED`/`ERROR`
  through the unmodified Phase 6 state machine.
- `YouTubeTarget` (department-scoped, resolves OD-36) — connected via a verified
  refresh-token entry (not a full OAuth consent-screen flow, a deliberate scope
  reduction, ADR-0039), tokens encrypted at rest (AES-256-GCM). `Template.youtubeTargetId`
  wired end-to-end with server-side verification and Job-creation-time enforcement.
- Delivery-only retry (`retryJobDelivery`, resolves OD-13) via a narrow `ERROR ->
DELIVERING` escape hatch (`transitionJobRow` called directly — deliberately not added
  to the general state graph, to keep `ERROR` terminal for `isTerminalState`'s other
  caller).
- `cleanupJobArtifacts` — a safe, idempotent, reference-aware video-deletion primitive,
  not yet auto-triggered (OD-18 stays open).
- A `JOB_ARTIFACT` File is now explicitly refused by the ordinary Gallery delete action
  for every role, closing a gap the new artifact category would otherwise have left open.
- Manually verified end-to-end against a real database and a real, generated test video
  (via `ffmpeg` itself): the happy path, idempotent duplicate submission, a malicious/
  bogus job id, and artifact cleanup (including its own idempotency) all passed.

**Explicitly NOT in Phase 9:** a self-service OAuth consent-screen UI, per-YouTube-target
upload quota, automatic/scheduled artifact cleanup, any background-job/queue
infrastructure, configurable YouTube privacy/metadata, a dashboard in-app notification
center, user/department management.

### Phase 10 — UI completion, testing & production hardening _(complete)_

**Goal:** no new features — complete the two features every prior phase status
explicitly deferred by name (Users, Departments), audit the whole system for security/
reliability/consistency defects, and fix what's found.

**Delivered:**

- Users: `/users` (list, search, pagination, department column for ADMIN) and
  `/users/new` (create) — wires Phase 3's already-tested `authorize-user-management.ts`
  policy to real repository mutations for the first time (`create-user.ts`,
  `list-users.ts`, `set-user-active-status.ts`, `change-user-role.ts`). No policy
  changes — OD-05 (can MANAGER mint a MANAGER) and the MANAGER role-change question stay
  exactly as conservatively resolved in Phase 3.
- Departments: `/departments` — every role sees their own department; ADMIN additionally
  sees and can create/rename any department (`department:manage`). **Deliberately no
  delete/archive path** — OD-07 stays open, exactly as `docs/domain/departments.md`
  requires.
- Both features use the same department-scoped-404 pattern every other feature already
  established (`findUserInScope`, mirroring `findJobInScope`/`findTemplateInScope`) —
  no new authorization pattern was invented.
- A full security/architecture audit (shell execution, path traversal, disabled-user
  session enforcement, cross-department isolation, Worker/Telegram/Delivery auth
  boundaries) found the codebase already correct from Phases 1–9, plus two concrete
  defects, both fixed: the Worker result-upload endpoint buffered an oversized body
  fully into memory before checking its size (now rejected via `Content-Length` first);
  the dashboard's Overview page and its "Soon" sidebar badge were stale Phase 1
  placeholder copy long after the features it called "planned" had shipped (rewritten;
  the now-fully-dead `PlaceholderPage` component removed).
- 32 new tests (23 unit covering authorization/idempotency/self-lockout/cross-department
  paths + a real end-to-end run against Postgres). `npm run check` and `npm run build`
  both pass.

**Explicitly not in Phase 10** (documented future considerations, not silently
resolved): a self-service "Connect with Google" OAuth consent-screen flow for
`YouTubeTarget`; background-work/queue infrastructure (OD-40) — still needed for
scheduled artifact cleanup (OD-18), a `TelegramWizardState` TTL sweep, and a stuck-job
requeue sweep (OD-31); rate limiting (OD-41); a dashboard in-app notification center;
per-YouTube-target upload quota; a self-service `User.phone`-editing UI (ADR-0036);
Department archive/deactivate (OD-07); MANAGER minting another MANAGER (OD-05).

Studio was feature-complete for its scope at this point. Any item above was a new
decision to make explicitly, not a phase to start automatically — Phase 11 below was
exactly that: an explicit new brief, not a silent continuation.

### Phase 11 — Department UX, Worker API Key scoping, YouTube Department many-to-many, Template Department transfer _(complete)_

**Goal:** an explicit follow-on brief, not a self-initiated continuation — narrow the
`/departments`/`/youtube` nav+pages to ADMIN-only while keeping a non-ADMIN's own
Department visible; replace the single static `WORKER_API_KEY` with real, admin-managed,
Department-scoped Worker credentials; move `YouTubeTarget` from a single-Department FK to
many-to-many and ADMIN-only management; let ADMIN transfer a Template's Department.

**Delivered:**

- `WorkerApiKey` (`ADR-0040`): hashed secret (`keyHash`, SHA-256, `@unique`), `ACTIVE`/
  `REVOKED` status, many-to-many `departments`, ADMIN-only CRUD at `/worker-keys`
  (`worker_key:manage`) — create (secret shown once), revoke/reactivate, edit-Department-
  scope (full replace). `WORKER_API_KEY` removed from `@/server/env` entirely, no
  fallback. Every Worker Job operation now derives its Department scope server-side from
  the authenticated key (`WorkerAuthContext.allowedDepartmentIds`, threaded through
  `defineRouteHandler`'s new `TAuth` generic as `ctx.auth`) — the atomic claim query
  (`claimNextJobRow`) filters `WHERE "departmentId" = ANY(allowedDepartmentIds)` inside
  the same `SELECT ... FOR UPDATE SKIP LOCKED` statement, and every other Job operation
  (`getJobForWorker`, `transitionJobForWorker`, `updateJobProgress`,
  `updateJobDuration`, `acceptJobResult`) calls `assertWorkerDepartmentAccess` before
  touching a specific Job — `404`, never `403`.
- `YouTubeTarget.departmentId` (single FK) → `departments` (implicit many-to-many);
  `youtubeChannelId` became globally unique (was unique per-Department). `youtube:manage`
  moved to ADMIN-only (was `MANAGER+`, department-scoped) — connecting/scoping a shared
  channel is system-wide infrastructure configuration. Non-ADMIN Template/Job authoring
  is unaffected: still gated by `template:manage`/`job:manage`, filtered to the
  Department's assigned Targets.
- Template Department transfer: ADMIN-only, gated inside `updateTemplate` by
  `requireRole(actor, "ADMIN")` on the transfer branch specifically (a MANAGER/USER's
  `departmentId` is silently ignored, not merely rejected). Dependent File/YouTube-Target
  references are re-verified against the target Department. No historical-integrity
  mechanism was needed — `Job.departmentId` is a plain column copied once at Job
  creation, never a live join through the Template.
- `/departments`, `/youtube`, `/worker-keys` nav items and pages all moved to
  ADMIN-only, independently re-checked server-side on each page, not just hidden from
  nav. A non-ADMIN's own Department name is shown via `CurrentUser.departmentName` in the
  dashboard sidebar without the management page.
- New tests: Worker Job-scoping (positive in-scope / negative out-of-scope → 404 for
  every Worker operation, plus the atomic claim's Department filter), `WorkerApiKey`
  use-cases (create/list/revoke/reactivate/update-departments), `YouTubeTarget`
  ADMIN-only + multi-department connect, Template transfer (ADMIN success,
  MANAGER/USER rejection, nonexistent-department rejection, orphaned-reference
  rejection). Real end-to-end HTTP verification against Postgres additionally confirmed
  the atomic Department-scoped claim race behavior and the cross-department
  `404`-never-`403` guarantee for every Worker endpoint. `npm run check`/`npm run build`
  both pass.

**Explicitly not in Phase 11:** per-Worker rate limiting beyond ADR-0034's existing
idempotency guarantees; a generic multi-tenant RBAC system (still exactly three fixed
roles); any Worker-initiated Department self-service.

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
