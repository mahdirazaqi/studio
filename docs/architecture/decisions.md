# Architecture Decision Records (ADRs)

Each ADR records a decision, its status, and its consequences. **`DECIDED`** entries are
binding. Anything not decided is an `OPEN DECISION` — see
[../development/open-decisions.md](../development/open-decisions.md).

Format: Context → Decision → Consequences → Status.

---

## ADR-0001 — Studio is a standalone Next.js application

**Context.** Studio replaces the legacy `src/render` NestJS module. It needs both a panel
UI and backend behavior (Worker API, Telegram, delivery orchestration).

**Decision.** Build Studio as a single Next.js App Router application (TypeScript, React,
Server Components, Server Actions, Route Handlers). One deployable containing frontend and
backend.

**Consequences.**

- No separate API service to operate; the UI and domain logic ship together.
- Server Components/Actions remove most hand-rolled endpoint + DTO + client-fetch code.
- External clients (Worker) are served by a small set of Route Handlers.
- Background/durable work needs an explicit mechanism (Next.js has no built-in job
  runner) — tracked as an OPEN DECISION.

**Status:** DECIDED.

---

## ADR-0002 — PostgreSQL + Prisma replace MongoDB / Mongoose

**Context.** Legacy used MongoDB + Mongoose with no transactions, no referential
integrity, non-atomic job claiming, and embedded documents for assets.

**Decision.** Studio uses PostgreSQL with Prisma. No MongoDB, no Mongoose.

**Consequences.**

- Real transactions for multi-step writes (retry, delivery outcome).
- Row-level locking (`FOR UPDATE SKIP LOCKED`) enables atomic job claiming.
- Foreign keys + explicit lifecycle rules protect historical integrity.
- JSON/JSONB columns hold immutable snapshots where needed.
- Asset lists become real related rows (or JSONB snapshots) rather than embedded Mongo
  subdocuments.
- A migration from the legacy Mongo data set, if ever required, is a separate project and
  is **out of scope** unless a requirement says otherwise (OPEN DECISION).

**Status:** DECIDED.

---

## ADR-0003 — Internal UI operations use Server Actions / Server Components

**Context.** Legacy exposed all internal operations over GraphQL. Studio should not
rebuild a full API for its own UI.

**Decision.** All internal reads use Server Components / read functions; all internal
mutations use Server Actions. No internal REST endpoints for panel features. Every Server
Action is thin and calls a use case that performs authorization and business rules.

**Consequences.**

- Less boilerplate; authorization stays server-side by construction.
- Client components get data via server components or server actions, not `fetch`.
- Genuinely external needs still use REST (ADR-0004).
- Server Actions must still validate input and check authz — they receive untrusted data.

**Status:** DECIDED.

---

## ADR-0004 — External Render Worker communication uses versioned, authenticated REST

**Context.** The existing Render Worker speaks HTTP to a fixed set of endpoints. Legacy
made those endpoints **unauthenticated** and over-broad.

**Decision.** Studio exposes a small, **versioned** REST surface under `app/api/worker/`
for the Worker, mirroring the legacy endpoint semantics closely enough that the Worker
needs minimal changes. **Every Worker endpoint is authenticated** with a service
credential. Route Handlers are thin and call the same use cases as the rest of the app.

**Consequences.**

- The Worker must send a credential (mechanism = OPEN DECISION: static API key vs signed
  request vs mTLS). This is the one deliberate breaking change from legacy.
- Endpoint shapes stay close to legacy (`jobs/next` ≈ `jobs/fetch`, progress/state/
  duration/result) so the Worker's changes are limited to auth + minor path/version.
- The REST surface is explicitly _not_ a general API — only what the Worker needs, plus
  input-file upload.

**Status:** DECIDED (surface & auth requirement). Credential mechanism: OPEN DECISION.

---

## ADR-0005 — Jobs are never deleted

**Context.** Jobs are the historical/audit record of the pipeline. Legacy deleted jobs
on retry.

**Decision.** A Job row is **never** hard-deleted and **never** soft-deleted. It persists
forever. Cancellation and failure are **states**, not deletions. Retry creates a new Job
linked to the original via `retryOfJobId`.

**Consequences.**

- Job storage grows monotonically; archival/partitioning is a scaling concern for later
  (OPEN DECISION), not a deletion mechanism.
- Every historical Job must remain fully readable — drives ADR-0009 and ADR-0010.
- Reporting and auditing can rely on complete history.

**Status:** DECIDED.

---

## ADR-0006 — Templates are soft-deleted

**Context.** Historical Jobs reference the Template they were created from. Physically
deleting a Template would orphan those Jobs.

**Decision.** Templates support **soft deletion** only (`deletedAt` timestamp / status
field). The row remains in the database permanently. Soft-deleted (and disabled)
Templates disappear from creation pickers but remain resolvable for historical Jobs and
admin views.

**Consequences.**

- No hard-delete path for Templates in the API.
- "Disabled" and "deleted" are distinct: _disabled_ = hidden from new-job creation but
  otherwise intact; _deleted_ = also removed from management lists, kept only for history.
- Template name uniqueness must account for soft-deleted rows (OPEN DECISION: unique
  among non-deleted only, or globally).

**Status:** DECIDED.

---

## ADR-0007 — Users are disabled, never deleted

**Context.** Jobs, Templates, audit entries, and retries reference the User who acted.

**Decision.** Users have an `active` / `disabled` status. There is no user-deletion
operation. A disabled user cannot authenticate or act, but all historical references
remain valid.

**Consequences.**

- "Remove a user" in the UI means "disable".
- Re-enabling is possible.
- Personal-data / GDPR-style erasure, if ever required, needs a separate deliberate
  design (anonymization, not row deletion) — OPEN DECISION.

**Status:** DECIDED.

---

## ADR-0008 — Files may be hard-deleted when safe; two file categories

**Context.** Media bytes are expensive to keep forever, and most are transient job
inputs/outputs. But some files are a deliberately curated reusable library.

**Decision.** Files do **not** get soft deletion. A File may be **physically deleted**
(row + bytes) when doing so breaks no active or required dependency. Every File has a
category:

- **Persistent Gallery Asset** — kept until an authorized user explicitly deletes it, and
  only when safe.
- **Job Artifact** — tied to a specific Job; may be automatically physically deleted
  after that Job reaches a completed state, per the file lifecycle design.

**Consequences.**

- Historical Jobs must not depend on a File row still existing to remain readable — they
  rely on snapshots (ADR-0010). A deleted input File may leave a "missing media"
  indicator, never a broken record.
- "Safe to delete" needs a concrete definition (reference counting / dependency check) —
  detailed in [../data/lifecycle-rules.md](../data/lifecycle-rules.md); some specifics
  are OPEN DECISION.
- Automatic Job Artifact cleanup timing/retention window is an OPEN DECISION.

**Status:** DECIDED (policy). Cleanup specifics: OPEN DECISION.

---

## ADR-0009 — Historical data integrity is mandatory

**Context.** Users must be able to open a years-old Job and understand it completely.

**Decision.** Historical integrity is a hard requirement, not best-effort. The
combination of ADR-0005/0006/0007/0008 plus snapshots (ADR-0010) must guarantee that no
historical Job ever shows missing Template, missing User, or destroyed asset context.

**Consequences.**

- Any feature that could break an old Job's readability is rejected or redesigned.
- Foreign keys alone are not accepted as sufficient (see ADR-0010).

**Status:** DECIDED.

---

## ADR-0010 — Jobs carry an immutable snapshot of their creation context

**Context.** A Job's meaning depends on the Template definition and asset values _at the
time it was created_. Templates get edited; Files get deleted.

**Decision.** At creation time a Job stores an **immutable snapshot** containing at least:
the Template's render-relevant fields (composition, source, output, description, tags,
and the asset-slot definitions), and the fully resolved asset values (literal text, and
for file-backed assets the file path/reference plus identifying metadata). The Worker is
served from this snapshot. Later edits to the Template or deletion of a File do not
change the snapshot.

**Consequences.**

- The exact snapshot shape (columns vs JSONB, how much File metadata to copy, whether to
  also copy bytes for critical inputs) is an **OPEN DECISION** — see
  [../data/historical-integrity.md](../data/historical-integrity.md).
- The Worker fetch response is built from the snapshot, not from live Template/File rows.
- Editing a Template never retroactively changes existing Jobs.

**Status:** DECIDED (snapshot is required). Shape: OPEN DECISION.

---

## ADR-0011 — Department-based authorization

**Context.** Legacy `src/render` had **no** workspace/ownership isolation — any user with
a view permission could see every Template/Job/File system-wide.

**Decision.** Every scoped resource (User, Template, Job, File) belongs to exactly one
**Department**. Three roles: `USER`, `MANAGER`, `ADMIN`. USER and MANAGER operate only
within their own Department; ADMIN operates system-wide. Department scoping is enforced in
the application layer and defensively in repositories/read functions. See
[../domain/authorization.md](../domain/authorization.md).

**Consequences.**

- Every list/detail query is department-filtered unless the actor is ADMIN.
- Telegram-linked users are subject to the identical checks.
- Department **deletion** policy is an OPEN DECISION (data isolation makes it non-trivial
  because jobs are never deleted).

**Status:** DECIDED (model). Department deletion: OPEN DECISION.

---

## ADR-0012 — Legacy system is a behavioral reference, not an architectural source of truth

**Context.** A detailed analysis of the legacy render module exists
([../legacy/render-module-analysis.md](../legacy/render-module-analysis.md)).

**Decision.** Legacy behavior informs _what_ Studio should do for the business. Legacy
code, schema, and structure do **not** constrain _how_ Studio does it. Known legacy
defects (see [../legacy/known-issues.md](../legacy/known-issues.md)) must not be carried
forward for compatibility.

**Consequences.**

- No legacy code is copied or migrated.
- Where legacy behavior seems important but Studio requirements are silent, it is
  recorded as an OPEN DECISION with the consequence of each choice, not silently kept or
  dropped.
- Where legacy and a Studio architectural decision conflict, the decision wins.

**Status:** DECIDED.

---

## ADR-0013 — Job state machine with explicit, validated transitions

**Context.** Legacy accepted any integer as a job state via an unauthenticated endpoint;
`Downloading`/`Started` were never set anywhere in the codebase.

**Decision.** Studio defines an explicit Job state enum and an explicit allowed-transition
map. Every state change (from the Worker or internally) is validated against it; invalid
transitions are rejected. The concrete state set is specified in
[../domain/jobs.md](../domain/jobs.md) and mapped to legacy states in
[../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).

**Consequences.**

- The Worker cannot corrupt job state.
- Legacy numeric states are mapped to named Studio states at the Worker API boundary for
  compatibility.
- Terminal states (`UPLOADED`, `CANCELED`, and `ERROR` unless explicitly retryable) allow
  no further transitions except via the retry-creates-new-job path.

**Status:** DECIDED (approach). Exact enum values: proposed in jobs.md, open to
refinement in Phase 1.

---

## ADR-0014 — Telegram wizard state is durable (PostgreSQL), not in-process

**Context.** Legacy stored Telegram conversation state in plain in-memory objects: lost
on every restart, not shared across instances, unbounded growth, no TTL.

**Decision.** Telegram conversation/wizard state is persisted in PostgreSQL, keyed by
telegram user id, with an explicit step, a partial-input payload, and timestamps for TTL
cleanup. The Telegram adapter is otherwise stateless.

**Consequences.**

- Studio can be restarted / horizontally scaled without losing user progress.
- A cleanup job expires stale wizard rows.
- The adapter holds no business logic and no session memory.

**Status:** DECIDED.

---

## ADR-0015 — No unsafe shell execution

**Context.** Legacy built ffmpeg/ImageMagick commands by interpolating user-influenced
file paths into `child_process.exec` — a command-injection vulnerability.

**Decision.** Studio never uses `exec` with a constructed command string for media
tooling. It uses `execFile` / `spawn` with an explicit argument array, validated input
paths, timeouts, and bounded resource use. Stored filenames are system-generated, not
derived from user input.

**Consequences.**

- Media adapters take structured arguments, not command strings.
- Any future shell-out goes through a reviewed helper that forbids string commands.

**Status:** DECIDED.

---

## ADR-0016 — Delivery (YouTube/Telegram) is durable, not fire-and-forget

**Context.** Legacy kicked off YouTube/Telegram delivery with unawaited promises after
returning 200 to the Worker; a restart lost the delivery with no record and no retry.

**Decision.** After a render result is attached, delivery is scheduled through a durable
mechanism. Each target's outcome (success / failure + reason) is recorded on the Job. A
Job never silently stalls: it reaches `UPLOADED`, or `ERROR` with a reason, or is visibly
awaiting/retrying delivery.

**Consequences.**

- Needs the background-work mechanism (OPEN DECISION) — a queue, an outbox table + poller,
  or scheduled task.
- Failure reasons are surfaced to operators, not just logged.

**Status:** DECIDED (requirement). Mechanism: OPEN DECISION.

---

## ADR-0017 — Framework & stack version baseline (Phase 1)

**Context.** Phase 1 builds the application skeleton. The dev/CI environment runs
**Node.js 20.20** (Next 16 requires Node ≥ 20.9 but is very new and defaults to
Turbopack; some tooling still targets Node 22). A coherent, well-understood version set
is preferable to bleeding edge for a foundation.

**Decision.** Pin the stack to:

- **Next.js 15.5.x** (App Router), **React 19.1**, **TypeScript 5.9** (strict, plus
  `noUncheckedIndexedAccess` and `noImplicitOverride`).
- **Tailwind CSS v4** (CSS-first config, no `tailwind.config`), **shadcn/ui** ("new-york",
  neutral), **lucide-react** as the single icon library, **next-themes** for theming,
  **sonner** for toasts.
- **Zod 4** for validation, **@t3-oss/env-nextjs** for env, **Vitest 3** for tests,
  **ESLint 9** (flat config) + **Prettier 3**.

**Consequences.**

- Runs on Node 20; upgrading to Next 16 is a deliberate later step.
- Exact versions live in `package.json` / `package-lock.json`;
  `docs/architecture/tech-stack.md` tracks the summary.
- One icon library only — mixing is disallowed.

**Status:** DECIDED (Phase 1 baseline; revisit when the runtime moves to Node 22).

---

## ADR-0018 — npm is the package manager

**Context.** OPEN DECISION OD-44 (package manager). The Phase 1 brief initially suggested
pnpm; the project owner chose **npm** — it ships with Node, needs no Corepack setup, and
the project has no monorepo/workspace needs that would favor pnpm.

**Decision.** **npm** (bundled with Node 20, `npm >= 10`). `package-lock.json` is
committed. No `packageManager` field / Corepack. All scripts and docs use `npm run …`.

**Consequences.**

- CI and contributors use `npm ci` / `npm install`; `pnpm` / `yarn` are not used.
- `engines` pins `node >= 20.9` and `npm >= 10`.
- OD-44 is resolved.

**Status:** DECIDED. Resolves OD-44. (Superseded the initial pnpm choice before any
commit relied on it.)

---

## ADR-0019 — Application conventions: actions, route handlers, errors, boundary

**Context.** Phase 1 must establish repeatable conventions so features are built
consistently and can't accidentally violate the architecture.

**Decision.** The following are the project conventions, implemented in `src/server/*`:

- **Server Actions** go through `defineAction` and return `ActionResult<T>` — never throw
  to the client. ([server-actions.md](server-actions.md))
- **Route Handlers** go through `defineRouteHandler` — `authenticate` is mandatory,
  input is Zod-validated, errors map to `AppError.httpStatus`.
  ([rest-architecture.md](rest-architecture.md))
- **Errors** use one `AppError` class discriminated by `kind`; `toPublicError` is the
  only thing that crosses a trust boundary; internal errors never leak.
  ([error-handling.md](error-handling.md))
- **Server/client boundary** is ESLint-enforced: UI components cannot import `@/server/*`
  or `server-only`. ([server-client-boundary.md](server-client-boundary.md))
- **Auth** and **authz** are boundaries in `@/server/auth` and `@/server/authz`; Phase 1
  has no session backend and `getCurrentUser()` returns `null` by design.
  ([authentication-boundary.md](authentication-boundary.md),
  [../domain/authorization.md](../domain/authorization.md))
- **Env** is read only through `@/server/env`; **logging** only through `@/server/logger`
  (with redaction). ([environment.md](environment.md), [logging.md](logging.md))

**Consequences.**

- Feature code is thin at the edges and testable in the middle.
- New transports (Telegram) reuse the same use cases and error mapping.
- Deviations are visible in review (and often in lint).

**Status:** DECIDED.

---

## ADR-0020 — Custom DB-backed session authentication (no NextAuth/Auth.js, no JWT)

**Context.** OPEN DECISION OD-43 left the human session mechanism unresolved. Phase 2
needs a real one. Candidates considered: NextAuth/Auth.js, a stateless signed JWT, and a
custom opaque-token session backed by a database table.

**Decision.** Sessions are custom and DB-backed
([authentication.md](authentication.md)): a random opaque token is set in an httpOnly,
`sameSite=lax` cookie; the server stores only the SHA-256 hash of that token, alongside
`userId` and `expiresAt`, in a `Session` table. A request is authenticated by hashing the
cookie value and looking up the hash. Passwords are hashed with bcrypt (`bcryptjs`, cost
12). No NextAuth/Auth.js is introduced; no JWT is used for the session itself.

**Consequences.**

- **Immediate revocation.** Logout deletes the row. Disabling a user (a later phase) takes
  effect on every existing session on the very next request, because `resolveSession`
  joins `User.status` on every lookup — no separate blocklist or revocation sweep, unlike
  a stateless JWT.
- **No `SESSION_SECRET`.** Tampering with the cookie fails the hash lookup; it cannot forge
  a session, so there is no signing key to manage, rotate, or leak.
- **A DB read per request** to resolve identity, mitigated by React `cache()` de-duping it
  once per request. Acceptable for a panel application; would need revisiting for a
  very-high-QPS API surface (not Studio's shape).
- **No third-party auth framework** to configure around this project's existing
  `defineAction`/`AppError`/`@/server/env` conventions — the whole flow is a handful of
  small, readable modules under `@/server/auth` and `src/features/auth`, consistent with
  Studio's general preference (Server Actions over a framework, a custom error model over
  a library's) rather than an exception to it.
- Resolves **OD-43**.

**Status:** DECIDED.

---

## ADR-0021 — Prisma table naming: `@@map` to lowercase snake_case plural; columns stay camelCase

**Context.** OPEN DECISION OD-45 left Prisma naming unresolved. The first real schema
(Department, User, Session) needed an answer.

**Decision.** Every Prisma model maps its table name to lowercase snake_case plural via
`@@map` (`User` → `"users"`, `Session` → `"sessions"`). Column names are **not**
individually mapped — they keep Prisma's default, which matches the model's camelCase
field name exactly (`passwordHash`, `departmentId`, `createdAt`, ...).

**Consequences.**

- Table names read as ordinary Postgres identifiers a DBA or a raw SQL query would expect,
  without needing `"quoted"` mixed-case names.
- Columns stay camelCase (quoted identifiers in raw SQL, e.g. `"passwordHash"`) — the
  common, low-friction default for a Prisma + TypeScript codebase where the model fields
  are what application code actually reads. Full snake_case columns were considered and
  rejected as extra `@map(...)` noise on every field for a benefit (consistency with a
  hypothetical direct-SQL consumer) Studio doesn't have — there is no other, non-Prisma
  service reading this database.
- Every future model follows the same rule: `@@map` the table, leave columns alone.
- Resolves **OD-45**.

**Status:** DECIDED.

---

## ADR-0022 — Capability-based authorization: a registered role floor plus a cross-cutting department-scope check

**Context.** Phase 1 established the `Actor` shape and an `authorize()` placeholder that
allowed ADMIN only, keeping callers honest without hard-coding real policy. Phase 3 needs
the real policy, reusable across Server Actions, future REST, and future Telegram,
without building a full policy-engine/ACL-table system Studio doesn't need for three
fixed roles.

**Decision.** `@/server/authz` exposes a flat capability registry
(`CAPABILITY_POLICIES: Record<Capability, { minRole }>`) and one entry point,
`authorize(actor, capability, { departmentId? })`, that checks the registered role floor
and — orthogonally — department match (ADMIN bypasses). An unregistered capability throws
`internal` rather than silently allowing or denying. Department scope for a _specific_
resource instance uses a separate helper, `assertDepartmentScopeOrNotFound`, which throws
`not_found` (404) instead of `forbidden` (403) to avoid confirming a cross-department
resource id exists; list/search/count queries use `departmentScopeFilter(actor)` spread
into the query's `where` clause instead.

**Consequences.**

- Adding a capability is a one-line registry entry, transcribed directly from a decided
  row of [`../domain/authorization.md`](../domain/authorization.md)'s permission matrix —
  never an inline `if (actor.role === ...)` scattered through a use case.
- Role-floor and department-scope are independent axes checked by the same call, so a
  use case never forgets one while remembering the other.
- The 403-vs-404 split for resource-instance access vs. capability/route-level access is
  explicit in the API (two different function names), not a judgment call made ad hoc at
  each call site.
- `job:manage`, `file:manage`, `template:{view,manage}` are registered ahead of those
  features' implementation, encoding only their decided role floor (not the still-open
  "own resource" granularity of OD-03/OD-04) — those phases reuse the registry instead of
  designing it.
- No policy engine, no permission tables, no configurable RBAC — exactly the three fixed
  roles Studio has today; a fourth role or a fundamentally different rule shape is a new
  ADR, not a config change.

**Status:** DECIDED.

---

## ADR-0023 — Self-service role/status changes are always forbidden; MANAGER is scoped to USER-role targets only

**Context.** Phase 3 requires that no application operation let a user escalate their own
privileges, and that the system be structurally unable to lock out all administrators by
accident. `docs/domain/users.md` and `docs/domain/authorization.md` leave several related
questions as explicit `OPEN DECISION`s (OD-05: can MANAGER create/promote another
MANAGER; whether MANAGER can change a role at all; a "last remaining ADMIN" safeguard).

**Decision.** Implemented in `src/features/users/use-cases/authorize-user-management.ts`,
ahead of any actual user-management use case:

- **Nobody may change their own role or their own active/disabled status** through these
  functions — including ADMIN. This is the entire safeguard against an accidental
  ADMIN lockout for these two operations; no "count the remaining ADMINs" check is
  implemented or needed for them.
- **MANAGER may only create, disable/re-enable, or (once role changes are allowed for
  MANAGER at all) act on a `USER`-role target** — never a peer MANAGER, never an ADMIN,
  even within their own Department.
- **Changing an existing user's role is ADMIN-only** — the matrix's MANAGER cell for this
  operation is itself an open question, so the conservative default is to grant it to
  ADMIN alone rather than guess a partial MANAGER rule.
- **Only ADMIN may set/change a user's Department.**

**Consequences.**

- OD-05 and the "last remaining ADMIN" question remain genuinely open — this ADR
  documents the safe interim behavior, not a resolution of either. Resolving OD-05 later
  only changes `assertCanCreateUserWithRole`'s and `assertCanChangeRole`'s role check; it
  does not touch the self-modification or Department-change rules, which are independent
  of it.
- A future bulk operation (e.g. "disable all users in a department") still needs its own
  explicit ADMIN-lockout consideration if it could ever target every ADMIN at once — this
  ADR only closes the single-user self-service path.
- No schema change was needed — these are pure functions over already-available
  `Actor`/`User` fields (`id`, `role`, `departmentId`).

**Status:** DECIDED (interim/conservative defaults). OD-05 and the bulk-operation
ADMIN-lockout safeguard remain **OPEN DECISION**.

---

## ADR-0024 — Storage abstraction: a `StorageAdapter` interface, local disk the only implementation

**Context.** OD-42 left the object storage backend undecided. Phase 4 needs somewhere to
put uploaded bytes without hard-coupling the File domain to a specific backend, since a
production deployment will likely want S3-compatible storage while local development and
a single-instance deployment don't need one.

**Decision.** `src/server/adapters/storage` defines a small `StorageAdapter` interface
(`put`, `delete`, `stat`, `readStream` with optional byte range) and exports one
implementation today — `LocalStorageAdapter`, writing under `STORAGE_LOCAL_DIR`. The
domain/application layer never imports `node:fs` or a cloud SDK directly; only this
module does. There is no `getAccessUrl` on the interface — see the module's doc comment
and [files.md](files.md) "Access & preview" for why: Studio's file URLs are always
`/api/files/[fileId]` (the database id, re-authorized on every request), never a
storage-specific URL.

**Consequences.**

- Swapping to an S3-compatible adapter later is one new file implementing the same
  interface — nothing above it changes.
- No `STORAGE_DRIVER` env switch was added; there is exactly one adapter, so a runtime
  switch would be dead configuration. Add one only when a second adapter actually exists.
- The local adapter treats `key` as always system-generated (never user input) but still
  refuses to resolve outside its root, as defense in depth (Security Requirements §8).
- Byte-range reads (`readStream(key, { start, end })`) exist from day one so
  `/api/files/[fileId]` can serve `206 Partial Content` for audio/video scrubbing without
  a later interface change.
- Resolves OD-42's interface half; the specific production backend (S3 vs. something
  else) remains an open choice, made easy by this seam rather than blocked by it.

**Status:** DECIDED.

---

## ADR-0025 — File deletion is hard, immediate, and gated by a documented (not yet real) Job-dependency hook

**Context.** ADR-0008 already decided Files are hard-deleted when safe, with no soft
delete. Phase 4 implements File deletion before Job exists, so "safe" can't yet mean
"no active Job depends on this" for real — but the deletion path must not need a
breaking change when Job lands.

**Decision.**

- Deleting a File deletes the database row **before** the storage bytes. If the storage
  delete then fails, the result is an orphaned object with nothing referencing it
  (wasted space, logged, safe) rather than a database row pointing at bytes that might not
  exist (a broken "file" a user could still try to open) — the failure mode is chosen
  deliberately, not incidental.
- `assertNoActiveJobDependencies(file)` (`features/files/use-cases/
authorize-file-management.ts`) is called on every delete, today as a documented no-op —
  there is no Job model to query. When Jobs exist, that function (not its caller) gains a
  query for active-state (`QUEUED`/`CLAIMED`/`RENDERING`/`DELIVERING`) Jobs referencing the
  file and throws `conflictError()` if any exist.
- A USER may delete only a file **they uploaded**; MANAGER/ADMIN may delete any file in
  scope (`assertCanDeleteFile`) — the conservative reading of
  [../domain/authorization.md](../domain/authorization.md)'s "(own uploads? OPEN
  DECISION)" annotation on that matrix cell.
- Historical integrity for a future Job that used a since-deleted File does **not** depend
  on this row surviving: per ADR-0010, a Job copies the metadata it needs (name, type,
  size, dimensions) into its own immutable snapshot at creation time. This File row and
  its bytes are the live, reusable, deletable copy; the Job's snapshot is the permanent
  historical copy. Deleting a File a historical Job once used never breaks that Job — it
  can only ever affect whether the _original bytes_ are still previewable, which the
  snapshot already accounts for ("media no longer stored," per
  [../data/lifecycle-rules.md](../data/lifecycle-rules.md)).

**Consequences.**

- No speculative Job/JobAsset table was added to make this "safe" check real — the hook
  point is documented and unit-tested as a no-op, not faked.
- The Jobs phase has an exact, pre-agreed contract to implement against instead of
  re-deriving the deletion-safety design from scratch.
- `File.category` (`GALLERY_ASSET` | `JOB_ARTIFACT`) exists in the schema now even though
  nothing creates a `JOB_ARTIFACT` yet, so the Jobs phase doesn't need a schema migration
  just to start attaching artifacts to Jobs.

**Status:** DECIDED.

---

## ADR-0026 — File allow-list and per-kind size limits

**Context.** OD-21 asked Studio to confirm its upload allow-list and size limits against
what legacy already supported, rather than inventing a new (and possibly narrower) list.
Legacy (`qtical-backend-node/src/render/file/file.controller.ts`) accepted exactly
`jpg|jpeg|png|webp|mp4|mp3` by extension, with no size limit at all.

**Decision.** Studio keeps the exact same type allow-list — JPG/JPEG, PNG, WEBP images;
MP3 audio; MP4 video — validated against the **sniffed** content type (`file-type`), not
the client-declared one, with the extension required to agree at the kind level (not
exact format). New size limits, absent from legacy: **25 MB** images, **100 MB** audio,
**500 MB** video (`features/files/domain/file-types.ts`).

**Consequences.**

- No functionality legacy supported is lost; Studio only adds a size ceiling legacy never
  had (an unbounded upload was never a deliberate legacy feature, just a missing
  safeguard — Security Requirements §6 explicitly asks for one).
- The limits are generous enough for the media Studio actually handles (short source
  clips and rendered output, not raw unedited camera footage) without being effectively
  unbounded.
- `next.config.ts`'s `experimental.serverActions.bodySizeLimit` is set to `512mb` — just
  above the largest per-kind cap — as the outer framework ceiling; the precise per-kind
  limits are enforced in the use case, not by that config value.
- Resolves **OD-21**.

**Status:** DECIDED.

---

## ADR-0027 — Template name uniqueness, asset-level File defaults, and the Template→File dependency contract

**Context.** Phase 5 needed three related, previously-open questions resolved to implement
Templates at all: OD-09 (name uniqueness scope), OD-10 (are zero-asset Templates valid),
and OD-11 (does a Template asset store a default File reference, and if so how does that
interact with Phase 4's File deletion-safety design, ADR-0025).

**Decision.**

- **OD-09 — resolved as "unique per Department, among non-deleted rows"**, matching
  [`domain/templates.md`](../domain/templates.md)'s own recommendation. Enforced by a
  **partial unique index** (`(departmentId, name) WHERE "deletedAt" IS NULL`) added by
  hand into the generated migration SQL — Prisma's schema language has no first-class
  syntax for a filtered/partial unique constraint, so it cannot be declared as a plain
  `@@unique` in `schema.prisma`. A violation of this index still surfaces through Prisma
  as an ordinary `P2002` error (Prisma detects a unique violation by parsing Postgres's
  SQLSTATE 23505, not by having the index declared in its own schema model), so the
  repository's `isUniqueConstraintError` catch needs no special case for "the constraint
  isn't in the schema." No pre-check query is used before insert/update — the operation
  goes straight to the write and catches the constraint violation, which is what makes
  this actually race-safe (Phase 5 brief §27) rather than a `find-then-insert` race.
- **OD-10 — resolved as "allowed."** A Template with zero asset slots is valid (e.g. a
  fully static render with no Job-supplied inputs). No minimum-asset-count validation
  exists; forbidding it would have been an invented restriction with no requirement
  behind it.
- **OD-11 — resolved as "yes, an optional per-slot default File reference."**
  `TemplateAsset.defaultFileId` is a nullable FK to `File`, meaningful only for
  `kind: IMAGE | AUDIO | VIDEO` (`null` for `DATA`, enforced at the application layer,
  `features/templates/domain/template-asset-rules.ts`). The Template's brief was explicit
  and repeated about needing real File Gallery integration with cross-department
  rejection tests, which only makes sense if an asset can actually hold a File reference
  — so this OD is resolved now rather than left open with no way to build what was asked
  for.
  - **Department consistency** between a Template and any File its assets default to is
    enforced at the application layer on every create/update
    (`features/templates/use-cases/verify-file-references.ts`, calling
    `findGalleryFileIdsInDepartment` — department-scoped by the Template's own
    department, not the actor's, since ADMIN may author a Template for a department other
    than their own). Prisma cannot express a cross-row department-equality constraint, so
    this is not attempted at the DB level.
  - **The Template→File dependency** is the direct continuation of ADR-0025's
    `assertNoActiveJobDependencies` pattern, not a second, conflicting mechanism: a new
    sibling function, `assertNoActiveTemplateDependencies` (same file,
    `features/files/use-cases/authorize-file-management.ts`), is called from `deleteFile`
    right alongside the (still-unimplemented) Job check, and — unlike that one — is a
    **real** check today, because Templates actually exist: it counts every
    `TemplateAsset` row (of any Template, deleted or not) that currently defaults to the
    File being deleted, and throws a clean `conflict` error if any exist.
    `defaultFileId`'s `onDelete: Restrict` FK is defense-in-depth for the same case, so
    the count check deliberately does **not** scope itself to non-deleted Templates only
    — the FK is enforced regardless of the referencing Template's soft-delete state, and
    the app-level check must refuse in exactly the same cases the FK would, or a caller
    could still hit a raw Postgres foreign-key error after being told "safe to delete."
  - **Historical integrity is unaffected**: a Template's default-File reference is a live,
    _current_-configuration field on a mutable resource, not a historical Job record —
    ADR-0010's snapshot contract (a File's identifying metadata is copied into a future
    Job's immutable snapshot at Job-creation time) is what protects a historical Job's
    readability after a File is deleted, and remains completely unchanged by this ADR.

**Consequences.**

- Templates/Files gained one, symmetric pair of narrow, read-only cross-feature
  repository calls in each direction (Files → Templates for the dependency count; Templates
  → Files for the reference-verification lookup), matching the precedent Files → Departments
  already set in Phase 4 rather than inventing a new "shared read" abstraction layer.
- A Gallery File that is ever set as a Template asset's default becomes permanently
  undeletable until every Template asset referencing it is edited to remove that
  reference (including a _soft-deleted_ Template's asset) — a deliberate, documented
  trade-off favoring "never a dangling reference" over "always deletable."
- No Job/JobAsset table was added to make any of this real ahead of its own phase —
  `assertNoActiveJobDependencies` stays exactly the documented no-op ADR-0025 left it.

**Status:** DECIDED. Resolves OD-09, OD-10, OD-11.
