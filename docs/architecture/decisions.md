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

**Status:** DECIDED. Credential mechanism resolved in ADR-0032 (Phase 7).

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
  query for active-state (`QUEUED`/`CLAIMED`/`RENDERING`) Jobs referencing the
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

---

## ADR-0028 — Job historical snapshot: JSONB Template config + relational JobAsset rows

**Context.** ADR-0010 already decided a Job must carry an immutable creation-time
snapshot; OD-16/OD-22 left its storage form open ("JSONB column vs. dedicated table vs.
child rows", "confirm when Jobs land"). The Phase 6 brief separately required a "proper
relational Job Asset model... avoid storing arbitrary unstructured JSON when a strongly
typed relational model is appropriate" — a stronger, more specific instruction than
OD-22's own leaning ("the Job's snapshot = JSONB (immutable copy)"), which read as
folding the resolved asset values into the same blob as the Template config.

**Decision.** Split the snapshot in two, each stored the way its own shape actually
calls for:

- **`Job.snapshot` (JSONB)** — the Template-level half only: `templateId`,
  `templateName`, `composition`, `source`, `scriptRef`, `outputPattern`, `description`,
  `tags`, and the ordered `assetSlotDefinitions[]` (`key`/`kind`/`composition`/`layer`/
  `imageRatio` as they were). Flat, has no relational structure of its own, and needs no
  independent query access — a JSONB blob is the right shape (OD-16 resolved this way).
- **`JobAsset` (relational rows)** — one row per resolved slot value (plus one injected
  `SCRIPT` row), each carrying its own copied File metadata
  (`fileOriginalName`/`fileMimeType`/`fileSizeBytes`/`fileWidth`/`fileHeight`) alongside a
  nullable `fileId` FK (`onDelete: SetNull`). Resolves OD-22's Job-asset half as **child
  rows**, matching the brief's explicit instruction and enabling real queries — most
  importantly, `assertNoActiveJobDependencies`'s File-dependency check
  (`countActiveJobAssetReferencesToFile`), which is not expressible as a JSONB scan
  without an unindexed function scan.

Both halves are **written once, at creation, inside the same transaction as the Job row,
and never updated afterward** — there is no code path that writes either a second time.

**Consequences.**

- `assertNoActiveJobDependencies` (documented no-op since ADR-0025) becomes **real** in
  this phase: it counts `JobAsset` rows with a matching `fileId` whose `Job` is in an
  active state, and is scoped to active jobs only (unlike Templates' equivalent check) —
  once a Job leaves an active state, its `JobAsset` rows already carry everything a
  historical view needs, so a completed/failed/canceled Job never blocks a File's
  deletion.
- A deleted File never breaks a historical Job's readability: the `JobAsset` row's copied
  columns remain intact even after `fileId` is set to `null`, so the UI can always show
  "media no longer stored" with the original name/type/size still visible.
- Resolves OD-16 (JSONB for the Template-level half) and the Job-asset half of OD-22
  (child rows). The delivery-outcomes half of OD-22 remains open — no delivery mechanism
  exists yet.
- `Job.title` is computed once from the resolved `DATA` values (legacy rule, kept) and
  stored as a plain column — not re-derived from either half of the snapshot — so it
  survives even if the snapshot shape changes later.

**Status:** DECIDED. Resolves OD-16; resolves OD-22's Job-asset half (Template's half
already resolved by ADR-0027).

---

## ADR-0029 — Job state machine, transition primitive, and atomic Worker claim

**Context.** Legacy's `state` was a raw integer accepted without validation
(`changeStateJob`), and `fetch` claimed a Job via a non-atomic `findOne` → `save`,
allowing two Workers to claim the same Job under load. ADR-0013 already decided Studio
needs an explicit, validated state machine; this phase has to actually build it, plus the
claim mechanism ADR-0013 assumed would exist.

**Decision.**

- **Eight canonical states** (`features/jobs/domain/job-state-machine.ts`): `QUEUED →
CLAIMED → RENDERING → RENDERED → DELIVERING → UPLOADED`, with `ERROR`/`CANCELED` as
  failure/cancellation exits and `CLAIMED → QUEUED` as a requeue path (for a future
  Worker-timeout sweep — not implemented this phase). `UPLOADED`, `ERROR`, `CANCELED` are
  terminal (no outgoing transitions). This is the exact graph
  [`domain/jobs.md`](../domain/jobs.md) already proposed — Phase 6 makes it the only path
  `Job.state` can ever change through.
- **One transition primitive**, `transitionJob(jobId, targetState, extra?)`
  (`features/jobs/use-cases/transition-job.ts`) — no `Actor` parameter, since it is a
  system/Worker-level operation (the Worker is never a `User`, Phase 6 brief §38).
  `cancelJob` (human, authorized) and every future Worker Route Handler (Phase 7) call
  this _after_ their own separate authorization/authentication check, never around it. A
  pre-check against the current state gives a specific, friendly error for the common
  case; the actual correctness guarantee is the next point.
- **Every write to `Job.state` is a single conditional `UPDATE ... WHERE state IN
(fromStates)`** (`transitionJobRow`), not a read-then-write. Postgres executes that as
  one atomic statement, so a concurrent conflicting change (e.g. a human cancel racing a
  Worker's own state report) can never be silently overwritten — the loser's `UPDATE`
  matches zero rows and the use case reports a `conflict`, never silently succeeding on
  stale data.
- **Atomic Worker claim** (`claimNextJobRow`): `UPDATE jobs SET state = 'CLAIMED', ...
WHERE id = (SELECT id FROM jobs WHERE state = 'QUEUED' ORDER BY "createdAt" FOR UPDATE
SKIP LOCKED LIMIT 1) RETURNING id` — one raw SQL statement (Prisma's query builder has
  no `SKIP LOCKED` support), global and FIFO by `createdAt`, exactly matching legacy's
  single shared queue but race-free. Manually verified: two genuinely concurrent
  `claimNextJob()` calls against the real database never return the same Job id.
- **Retry eligibility narrowed from legacy** (resolves OD-02's "which states" half):
  legacy allowed retry from almost any non-terminal state (everything except
  `Rendered`/`Uploading`/`Uploaded`, including mid-render states); Studio allows retry
  only from `ERROR` and `CANCELED` — a Job that hasn't actually stopped has no reason to
  be retried, and allowing it invites a confusing duplicate render. `JOB_RETRY_WINDOW_DAYS`
  (default 3, matching legacy) resolves the window half.
- **Cancel/timeline fields are never reset** (`progress`, `durationSeconds`,
  `claimedAt`/`startedAt`/`renderedAt`/`deliveredAt`/`uploadedAt`) — legacy zeroed
  `progress`/`duration` on cancel; Studio keeps them, since historical integrity favors
  keeping the record over a cosmetic reset (resolves part of OD-26).

**Consequences.**

- No use case anywhere assigns `job.state = ...` directly — grep for `state:` assignments
  outside `job-repository.ts` finds none, by construction.
- Progress/duration updates are rejected once a Job reaches any terminal state (a small,
  deliberate widening of legacy's "only blocked by Cancel") — `updateJobProgress`/
  `updateJobDuration` reuse the same `state NOT IN (terminal)` guard as a plain
  `updateMany`, without needing the full `transitionJob` machinery (they don't change
  `state` itself).
- Resolves the "which states"/window halves of OD-02. The Worker-timeout requeue policy
  (`CLAIMED`/`RENDERING` stuck past a timeout) remains **OPEN DECISION** (OD-31) — the
  `CLAIMED → QUEUED` transition exists in the graph for it, but no sweep exists yet.

**Status:** DECIDED.

---

## ADR-0030 — Daily upload quota: global cap, advisory-lock concurrency

> **Superseded, ADR-0041.** The upload quota this ADR designed (`JOB_UPLOAD_DAILY_CAP`,
> the advisory-lock logic, `Job.deliverToYouTube`) was removed entirely — YouTube upload
> no longer exists, so there is nothing left to cap. The **advisory-lock pattern**
> itself (`pg_advisory_xact_lock` for race-safe count-then-insert) remains documented
> here as prior art if a future rate-limited resource ever needs the same technique.

**Context.** Legacy hard-coded a global cap of 3 upload-enabled Jobs per UTC day,
enforced by `count, then insert` with no concurrency protection — two simultaneous
requests could both pass the check and exceed the cap. OD-01 asked whether Studio should
change the scope (global / per-Department / per-YouTube-target); the Phase 6 brief
explicitly directed keeping the exact legacy rule for now.

**Decision.**

- **Scope stays global, UTC-day, count-based** — `JOB_UPLOAD_DAILY_CAP` (default 3,
  configurable) counted against every `deliverToYouTube: true` Job created since the
  start of the current UTC day, excluding `ERROR`/`CANCELED` ones (matches legacy's
  `$nin` filter). No `YouTubeTarget` model exists yet to scope a per-target cap against —
  OD-01 stays open on that count, revisited when YouTube delivery lands.
- **Concurrency-safe via a Postgres advisory transaction lock**
  (`pg_advisory_xact_lock`), keyed by a fixed namespace plus a hash of the current UTC
  date, taken at the start of the same transaction that counts today's usage and inserts
  the new Job (`assertUploadQuotaAvailable`, `features/jobs/repository/
job-repository.ts`). Every concurrent upload-enabled creation for the same day
  serializes through this lock; the count-then-insert inside it can never race, because
  the next waiter only proceeds after the previous transaction commits or rolls back. The
  lock is transaction-scoped (`_xact_`), so it releases automatically — no manual unlock,
  no risk of a held lock outliving a crashed request.
- The same lock (and its `Job` row-lock counterpart on the original, `SELECT ... FOR
UPDATE`) protects `retryJob`'s quota re-check.
- Manually verified against the real database: three upload-enabled Jobs succeed, a
  fourth is rejected with a clean `conflict` error naming the limit, and a non-upload Job
  is unaffected by the count.

**Consequences.**

- No separate `UploadQuotaUsage` counter table was introduced — counting `Job` rows
  directly inside the lock is simple and correct at Studio's expected volume, and adding
  a counter table would only trade a `COUNT` query for extra write-side bookkeeping with
  its own consistency burden.
- The advisory lock's two-argument form requires explicit `::int` casts on both
  arguments (Postgres has no `(bigint, int)` overload) — a real bug caught during manual
  verification and fixed before this ADR was written.
- This is a repository-level business decision by necessity, not convention: the lock +
  count + insert only work as one atomic unit inside a single `$transaction` callback,
  and only the repository layer opens transactions (`project-structure.md` already lists
  "atomic ops" as a repository responsibility).

**Status:** DECIDED (global scope, concurrency mechanism). Per-target scope: **OPEN
DECISION** (OD-01), pending YouTube delivery.

---

## ADR-0031 — Non-destructive retry: original preserved, historical snapshot copied verbatim

**Context.** Legacy's `retryJob` **deleted the original Job** (`findOneAndDelete`) before
creating its replacement, and checked the upload quota _after_ the delete — a failed
quota check meant the original was already gone, a straightforward data-loss bug.
ADR-0005 already forbids deleting a Job at all; this phase has to design the actual
non-destructive mechanism.

**Decision.**

- **`retryJob` never modifies or deletes the original.** It creates a **new** Job row,
  linked via `retryOfJobId`, with `attemptNumber = original.attemptNumber + 1`. The
  original keeps its own `id`, state, timeline, and snapshot exactly as they were.
- **The retry copies the original's `snapshot` and `JobAsset` rows verbatim** — it never
  re-loads the live Template or re-resolves Files. If the Template was edited (or a File
  deleted) since the original was created, the retry still renders exactly what the
  original was supposed to (Phase 6 brief §26, "critical"). This is why `retryJob`
  imports nothing from `features/templates/repository` at all.
- **The retry keeps the original's creator** (`createdByUserId`, legacy `_createdBy`
  behavior, kept) — `retriedByUserId` records who actually triggered the retry,
  separately.
- **Concurrency**: the retry transaction takes `SELECT ... FOR UPDATE` on the _original_
  Job row before its eligibility/quota checks, serializing concurrent retry attempts of
  the same original. This is deliberately **not** a full idempotency-key framework: two
  genuinely simultaneous retry clicks can still each pass their checks (once the row-lock
  releases) and produce two sibling retries — a client-side double-submit guard is the
  intended defense against that specific case, not a server invariant, per the Phase 6
  brief §46's explicit permission to skip a generic mechanism "unless needed."

**Consequences.**

- No Job is ever at risk of being lost by a failed or racing retry — the worst case of a
  double-submit is two redundant retry Jobs, never zero.
- Retry lineage is a simple, bounded chain (`retryOfJobId` + `attemptNumber`), not a
  general graph — querying "all attempts of an original" is a single indexed lookup
  (`@@index([retryOfJobId])`), and there is no unbounded recursive structure to guard
  against.
- Manually verified: retrying preserves the original's state/timeline untouched, the new
  Job's title/snapshot match the original exactly, retry is correctly rejected outside
  the eligibility states and past the retry window, and the daily upload quota is
  re-enforced on the retry exactly as on a fresh creation.

**Status:** DECIDED.

---

## ADR-0032 — Worker authentication: a single shared static API key, no database model

**Context.** ADR-0004 already decided every Worker endpoint must be authenticated
(OD-27, mechanism left open). Legacy's Worker routes were completely unauthenticated.
`docs/security/security.md` and `docs/integrations/worker-api.md` had both floated a
`WorkerCredential` table (hashed key, revocable, shown once at creation) as the
recommended starting point. The Phase 7 brief explicitly pushed the other way: choose
the simplest secure mechanism, do not build a Worker database model "unless genuinely
required," no API-key CRUD, no multi-key administration.

**Decision.** A single, shared static API key — `WORKER_API_KEY`, a **required**
environment variable (`@/server/env`, process fails to start without it, matching how
`DATABASE_URL` is already required) — sent as `Authorization: Bearer <key>` on every
`/api/v1/worker/**` request and every Worker-authenticated `/api/files/[fileId]`
request. `@/server/worker-auth` (`authenticateWorker`) is the sole place this credential
is read or compared:

- Compared with a **timing-safe** check: both the submitted token and the configured
  key are SHA-256-hashed to a fixed-length digest first, then compared with
  `crypto.timingSafeEqual` — this sidesteps `timingSafeEqual`'s own equal-length
  requirement (which a naive length check would violate, and which itself leaks the
  secret's length one guess at a time) while still being constant-time on the actual
  secret comparison.
- **Not hashed at rest.** The key lives only in environment configuration — there is no
  database row to protect from a SQL-level leak, so hashing "at rest" has no additional
  target here (unlike a bcrypt password hash, which protects against a stolen `User`
  table). This is a deliberate departure from `docs/security/security.md`'s earlier
  "stored hashed" language, since that assumed a `WorkerCredential` table this ADR
  decides not to build.
- **No revoke-without-redeploy, no rotation UI, no multiple keys.** Rotating the
  credential means changing the environment variable and redeploying — the old value
  simply stops working the moment the new one is live. This is the direct, accepted
  cost of skipping a `WorkerCredential` table.
- **The Worker never becomes an `Actor`.** It has no Department, no role, and is not a
  `User` — the Job/File use cases it reaches (`claimNextJob`, `updateJobProgress`,
  `updateJobDuration`, `transitionJob`, `getJobForWorker`,
  `getFileForWorkerServing`) all take no `Actor` parameter at all, by design (Phase 6
  already established this pattern for the Job side; Phase 7 extends it to the one File
  read the Worker needs).

**Consequences.**

- A leaked key grants full Worker access to the entire Job queue and every File a Job
  might reference, globally, with no per-instance or per-Department restriction —
  documented honestly (ADR-0034) rather than implying a scoping that doesn't exist.
- If Studio ever needs multiple Workers with independent revocation, rate limits, or
  audit attribution, that is a new `WorkerCredential` table and a new ADR — not a
  reinterpretation of this one. Nothing in the Job/File application layer assumes there
  is only ever one Worker (no Worker identity is threaded through `Job`/`JobAsset` at
  all), so adding that table later does not require touching the domain layer.
- Resolves OD-27.

**Status:** DECIDED.

---

## ADR-0033 — Worker API surface: versioned REST under the existing convention, `204` for an empty queue

**Context.** `docs/integrations/worker-api.md` and `docs/architecture/rest-architecture.md`
already sketched a `/api/v1/worker/...` surface and a `POST .../jobs/next` claim endpoint
returning `204` when empty, ahead of Phase 6/7 existing — this phase had to decide
whether to build that already-documented design or the Phase 7 brief's own throwaway
illustrative example (`/api/v1/worker/...`, `POST .../jobs/claim`), which explicitly
labels itself "examples only."

**Decision.** Built exactly the already-documented surface, since "established Studio
implementation" (the existing docs) outranks a brief's self-disclaimed illustration:

| Method  | Path                               | Maps to legacy             | Calls                                             |
| ------- | ---------------------------------- | -------------------------- | ------------------------------------------------- |
| `POST`  | `/api/v1/worker/jobs/next`         | `GET /jobs/fetch`          | `claimNextJob()`                                  |
| `GET`   | `/api/v1/worker/jobs/:id`          | `GET /jobs/:id`            | `getJobForWorker(id)`                             |
| `PATCH` | `/api/v1/worker/jobs/:id/state`    | `PATCH /jobs/:id/state`    | `transitionJobForWorker(...)` (→ `transitionJob`) |
| `PATCH` | `/api/v1/worker/jobs/:id/progress` | `PATCH /jobs/:id/progress` | `updateJobProgress(...)`                          |
| `PATCH` | `/api/v1/worker/jobs/:id/duration` | `PATCH /jobs/:id/duration` | `updateJobDuration(...)`                          |

Retry and cancel are **not** exposed to the Worker — legacy's Worker REST contract never
called either (both were GraphQL-only, dashboard-initiated in legacy), and nothing in
the actual Worker lifecycle requires it (Phase 7 brief §19/§18: don't expose an internal
capability to the Worker just because it exists). Result/output upload is **not**
implemented — see "Deferred" below.

**Empty-queue semantics:** `POST .../jobs/next` returns **`204 No Content`** when no Job
is eligible, using `defineRouteHandler`'s existing `null` → `204` mapping
(`claimNextJob()` already returns `null` for this case, Phase 6) — not an error, not an
ambiguous `200` with an empty body. A Worker's poll finding nothing to do is a normal,
expected outcome.

**Response contract:** the existing `defineRouteHandler` convention is used as-is — a
success response is the handler's return value serialized directly as the JSON body (no
extra `{"data": ...}` envelope); an error response is `{ error: PublicError, requestId
}` with the error's own `httpStatus`. Introducing a different envelope for just the
Worker surface would be inconsistent with the one REST convention Studio already has,
for no benefit.

**Worker→File download:** `/api/files/[fileId]` (Phase 4) is extended, not replaced — a
request bearing an `Authorization` header is authenticated as a Worker (unscoped by
Department, see ADR-0034) and served; a request without one falls back to the original,
unchanged session-cookie path. This was the pragmatic resolution to a gap none of Phases
4–6 explicitly closed: the Worker payload must include "resolved File information
required for download" (Phase 7 brief §12), but Studio's storage abstraction (ADR-0024)
never hands out a raw filesystem path the way legacy's `File.path` did — the Worker
downloads bytes the same way a browser does, over HTTP, with its own credential instead
of a session cookie.

**Consequences.**

- The claim/get-by-id payload (`buildWorkerJobPayload`,
  `features/jobs/domain/worker-job-payload.ts`) keeps legacy's exact field names
  (`output`/`title`/`composition`/`template`/`assets[].{composition,layer,type,src,text}`)
  and only **adds** `state` and `key` — additive, non-breaking per
  `docs/integrations/worker-api.md`'s own compatibility principle.
- `PATCH .../state` accepts **either** a legacy integer (0–9, mapped via
  `mapWorkerState`) **or** a Studio canonical name, exactly as
  `docs/integrations/worker-api.md` already specified — the Worker's own upgrade to
  Studio's new names can happen on its own schedule.
- No result/output upload endpoint (`POST /jobs/:id/upload`'s Studio equivalent) exists
  yet — it needs `JOB_ARTIFACT` creation and a screenshot/thumbnail pipeline, neither of
  which exists (Phase 6 explicitly deferred both). Building a placeholder endpoint that
  stores nothing real was explicitly rejected by the brief (§20) as worse than not
  building it at all.

**Status:** DECIDED. Resolves the versioning/empty-queue/response-contract half of
OD-28/OD-29 (the Worker-fetch-compat OPEN DECISIONs);
`docs/integrations/worker-api.md`'s remaining `GET`-alias-for-`fetch` compatibility
question stays open since the actual Worker's tolerance for a `POST`-only claim
endpoint is unconfirmed.

---

## ADR-0034 — Worker trust model and repeated-request (idempotency) semantics

**Context.** Phase 7 brief §14/§31/§32 require the Worker API to state its trust model
honestly (rather than implying protections that don't exist) and to survive repeated/
retried HTTP requests without weakening any Phase 6 concurrency guarantee.

**Decision — trust model.** Studio's Worker is **one shared, non-departmental
principal**. There is no per-Worker identity, so:

- `GET /api/v1/worker/jobs/:id` lets an authenticated Worker read **any** Job by id,
  claimed or not, from any Department — resolves OD-30 as "no per-claim ownership
  restriction," because none can be enforced honestly without a per-Worker identity
  this phase deliberately does not build (ADR-0032). If two physical Worker processes
  somehow share the one credential, each can read (and, via the state/progress/duration
  endpoints, mutate) any Job the other is working on — documented, not hidden.
- `GET /api/files/[fileId]` under Worker auth is similarly unscoped by Department — the
  Worker already receives every `fileId` it should ever ask for via its own Job
  payload, so there is no separate access decision to make at download time beyond "is
  this a valid Worker credential."
- This does **not** weaken dashboard-user Department isolation in any way — human
  `Actor`-based paths are completely unchanged; the Worker's global reach is a property
  of the Worker being a different kind of principal entirely, per
  `docs/architecture/authorization.md` "Non-user principals."

**Decision — repeated requests are safe without a generic idempotency framework:**

- **Claim** (`POST .../jobs/next`): naturally safe. Each call independently runs the
  atomic `SELECT ... FOR UPDATE SKIP LOCKED` claim (ADR-0029); a retried claim request
  simply claims the _next_ eligible Job, if any — it can never re-claim a Job the first,
  successful attempt already moved out of `QUEUED`. Manually verified with real
  concurrent HTTP requests: two simultaneous `POST` calls claim two different Jobs.
- **State transition** (`PATCH .../state`): safe via `transitionJob`'s existing atomic
  conditional `UPDATE ... WHERE state IN (fromStates)` (ADR-0029) — a retried request for
  a transition that already succeeded finds the Job no longer in the expected `from`
  state and fails closed with `409 conflict`, never silently reapplying or corrupting
  history. This is a deliberate "fail loud on repeat," not silent success — the Worker's
  own retry logic is expected to treat a `409` on a state PATCH as "this likely already
  went through" rather than an outage.
- **Progress/duration** (`PATCH .../progress` / `.../duration`): naturally idempotent —
  reporting the same value twice (or a retried request after a lost response) simply
  writes the same number again; `updateJobProgress`/`updateJobDuration`'s only guard is
  "not terminal," which a retry of a still-valid report always passes.
- **No new idempotency-key mechanism was added** — every endpoint's safety comes from
  the underlying Phase 6 primitive already being safe under concurrency, not from a
  Worker-API-specific deduplication layer. This matches the brief's own "do not add a
  generic distributed idempotency framework unless needed" (§31, mirroring ADR-0031's
  identical reasoning for dashboard-initiated retry).

**Consequences.**

- No in-memory locks, no Redis, no idempotency-key table — every guarantee here already
  survives multiple Next.js instances and process restarts, because it is enforced at
  the PostgreSQL level (ADR-0029/0030), not in application memory.
- A future per-Worker-identity feature (if ever needed) would change the trust-model
  half of this ADR without touching the repeated-request half at all — the two are
  independent.

**Status:** DECIDED. Resolves OD-30 (Worker claim scope) as "no per-claim restriction,
by design."

---

## ADR-0035 — Telegram runtime: webhook + a single Telegraf instance

**Context.** OD-34 left webhook vs. long-polling open, with a lean toward webhook (fits
the single-deployable model). Phase 8 has to actually build a Telegram bot, and needs a
library and a concrete runtime shape.

**Decision.**

- **Library:** `telegraf` (the same one legacy used, via `nestjs-telegraf` — no reason to
  evaluate alternatives when the incumbent is the standard, actively maintained choice for
  Node/TypeScript and legacy's own use of it already validates the fit).
- **Transport: webhook**, resolving OD-34. `POST /api/telegram/webhook`
  (`src/app/api/telegram/webhook/route.ts`) is a thin `defineRouteHandler`, matching every
  other external entry point's shape: authenticate (Telegram's own secret-token webhook
  mechanism, `@/server/telegram-webhook-auth`) → parse → `bot.handleUpdate(update)` →
  `204`. No polling worker process, no second deployable, no single-consumer coordination
  problem to solve.
- **One Telegraf instance per process** (`@/server/adapters/telegram/client.ts`,
  `getTelegramBot()`), cached on `globalThis` exactly like `@/server/db`'s `PrismaClient`
  singleton — necessary because Next.js dev-mode module reloads would otherwise construct
  a second `Telegraf` (and, worse, register its handlers a second time) on every file
  change. `getTelegramBot()` returns `null` when `TELEGRAM_BOT_TOKEN` is unset — unlike the
  Worker API's `WORKER_API_KEY`, the Telegram bot is an **optional** deployment feature;
  Studio runs completely normally without it configured.
- **Handler registration is separated from the client**: `getTelegramBot()`
  (`@/server/adapters/telegram`) constructs/returns the raw client only; a second,
  feature-layer function, `getRegisteredTelegramBot()`
  (`@/features/telegram/bot/register.ts`), attaches `telegramComposer` to it exactly once
  (its own `globalThis`-cached boolean flag), mirroring the same split
  `@/server/adapters/storage` already has from the `features/files` code that uses it.

**Consequences.**

- No `ENABLE_TELEGRAM` flag (legacy had one) — "configured" (`TELEGRAM_BOT_TOKEN` set) and
  "enabled" are the same thing; there is no state where the token is set but the bot is
  deliberately switched off.
- Local development without a real bot token still runs the whole app normally; only the
  webhook route (`dependency`/503) and any outbound send are affected, and outbound sends
  are logged rather than thrown when Telegram is disabled.
- Resolves OD-34.

**Status:** DECIDED.

---

## ADR-0036 — Telegram identity: unique phone-based linking, no session for the Actor

**Context.** `docs/domain/users.md` already sketched phone-based linking as future schema
("`phone`, `telegramUserId` ... land with Telegram integration") and OD-06 left the
ambiguous/no-match case open. Phase 8 has to add the columns and the actual linking
use case, and decide how a Telegram update becomes an authorized `Actor` without a session
cookie.

**Decision.**

- **`User.phone` and `User.telegramUserId` are both nullable, `@unique` columns**, added
  in this phase. Matching is `/start` → Telegram's native "share contact" button →
  `normalizePhone` (digits-only, `features/telegram/domain/phone.ts`) → look up an
  `ACTIVE` User by that normalized phone → set `telegramUserId`.
- **OD-06 resolved:** because `phone` is unique, an _ambiguous_ match can never occur by
  construction — the only real outcome besides a match is "no match", handled with one
  generic, safe message that never reveals whether a differently-statused account exists
  for that number.
- **A self-shared contact only** — `message.contact.user_id` (Telegram sets this to the
  sender's own numeric id when _they_ tapped "share my phone number"; it is absent or
  different for a forwarded contact card) is checked against the inbound `ctx.from.id`
  before attempting a match, so forwarding a colleague's contact card can never link their
  phone to the forwarder's Telegram account.
- **No self-service phone-editing UI.** Setting `User.phone` in the first place is treated
  as **Users-feature** scope (the fields were always documented as landing there,
  independent of who builds the UI), not Telegram-feature scope — matching legacy, where
  phone was set through the (separate) admin/user-management surface, not the bot. Studio
  has no user-management UI yet (Phase 3 note, unchanged), so `phone` is set today via
  `prisma db seed` (a new optional `SEED_ADMIN_PHONE` var) or a direct administrative
  write, until a future user-management phase adds a real field for it. This was a
  deliberate scope boundary, not an oversight — see Phase 8 brief §65 ("do not implement
  ... new business features not required by the legacy workflow").
- **The Telegram `Actor` is built directly, without a session.**
  `resolveTelegramIdentity(telegramUserId)`
  (`features/telegram/use-cases/resolve-telegram-identity.ts`) looks up the linked User by
  `telegramUserId` (only `ACTIVE`, mirroring `@/server/auth/session`'s identical status
  filter) and constructs an `Actor` the same shape `toActor(currentUser)` builds for a web
  session — `@/server/authz`'s own doc comment anticipated exactly this. Every downstream
  use case runs `authorize(actor, ...)` identically regardless of which transport built the
  `Actor` (Phase 8 brief §66).

**Consequences.**

- A disabled User's Telegram identity is inert the instant they're disabled — the same
  lookup that gates web sessions gates this one, with no separate revocation step.
- No OTP/password step for Telegram — matches legacy's UX exactly, since phone possession
  (proven via Telegram's own "share contact" button, not a typed number) is the entire
  proof of identity, same as legacy.
- Resolves OD-06. `phone`'s normalization is intentionally simple (digits-only, no
  `libphonenumber`) — documented as a known, accepted limitation in
  `features/telegram/domain/phone.ts` rather than a general phone-number solution.

**Status:** DECIDED. Resolves OD-06.

---

## ADR-0037 — Durable, TTL'd wizard state with atomic-conditional-update duplicate protection

**Context.** ADR-0014 already decided wizard state must be durable (PostgreSQL), fixing
legacy's in-process `TelegrambotDataset`/`TelegrambotJobDataset`. Phase 8 has to design the
concrete schema, expiration mechanism (OD-35), and — new requirements not present when
ADR-0014 was written — protection against a duplicate Telegram update re-advancing the
same step twice, and against a duplicate confirmation tap creating two batches of Jobs.

**Decision.**

- **`TelegramWizardState`** (`prisma/schema.prisma`): one row per Telegram user
  (`telegramUserId @unique`), linking to exactly one `User` (`userId @unique` — a Studio
  User has at most one active conversation), an explicit `flow`
  (`SINGLE_TRACK`/`ALBUM`) and `step` enum (`PICK_TEMPLATE`/`ASK_DELIVERY`/
  `ASK_TRACK_COUNT`/`COLLECT_ASSETS`/`CONFIRM`/`CREATING`/`COMPLETED`) — never an arbitrary
  string scattered through handlers — a validated JSONB `payload`
  (`features/telegram/schemas/wizard-payload.schema.ts`, re-validated on every read,
  Phase 8 brief §46), and `lastUpdateId`.
- **Expiration is lazy, not swept** (resolves OD-35): `TELEGRAM_WIZARD_TTL_MINUTES`
  (default 60) is checked against `updatedAt` the next time a row is read
  (`load-active-wizard-state.ts`); an expired row is deleted on the spot and treated as
  "no active conversation." There is no scheduled sweep — OD-40's durable-work mechanism
  doesn't exist yet to hang one on, and building a bespoke scheduler for this alone would
  be exactly the "sophisticated distributed session system" the brief says not to build
  (§15). A stale, never-revisited row simply sits until either the same user returns (and
  it's lazily cleared) or a future OD-40 mechanism adds a real sweep.
- **A corrupted payload never crashes the bot** (§17): if a row's `payload` fails
  `wizardPayloadSchema`, it's logged (no sensitive data — just the telegram id and step)
  and deleted, exactly like an expired row.
- **Every step change is one atomic conditional `UPDATE ... WHERE step IN (fromSteps)`**
  (`advanceWizardState`, `features/telegram/repository/telegram-repository.ts`) — the
  identical primitive `job-repository.ts`'s `transitionJobRow` uses for `Job.state`
  (ADR-0029), applied here for the same reason: a duplicate/racing Telegram update finds
  the row no longer in `fromSteps`, the `updateMany` matches zero rows, and the use case
  treats that as "already handled" rather than silently re-applying an action.
- **The CONFIRM → CREATING step change is the actual duplicate-Job-creation guard**
  (Phase 8 brief §51/§52): only the caller that wins this specific conditional update goes
  on to call `createJob` (once per track); a second, near-simultaneous confirmation tap
  finds the row already moved to `CREATING` and reports "already being processed" instead
  of creating a second batch. This is the same reasoning ADR-0031 already used for
  dashboard-initiated retry (a row-level lock/conditional-update serializes the race,
  not a generic idempotency-key framework) — deliberately not a bigger mechanism than the
  brief asks for (§51 "choose the simplest robust approach").
- **Album is a redesign, not a port** (Phase 8 brief §25): legacy's Album flow spliced
  ad hoc `Audio N`/`Song N` keys into a schema-less asset map that has no equivalent in
  Studio's typed `TemplateAsset` model (every Job input must match a real, author-declared
  slot key — `resolveJobAssets` rejects anything else). Studio's Album is instead: pick a
  Template once, ask a track count, then run the **exact same per-slot collection loop**
  Single Track uses, once per track (`advanceTrackCursor`,
  `features/telegram/domain/wizard.ts` — a pure function parameterized only by
  `trackCount`), producing `trackCount` independent `createJob` calls at confirmation. No
  `albumGroupId`/grouping entity was added (resolves OD-12 as "independent Jobs", the
  simpler option, matching what legacy's actual N-`addJob`-calls behavior already amounted
  to) — an Album's Jobs are traceable as a batch only by having been created in the same
  short time window, not by a schema relationship.
- **Partial-failure reporting, not a transaction** (§26): Jobs are created sequentially
  inside `confirmWizard`; the loop stops at the first failure (matching legacy's actual
  behavior — an unhandled exception mid-loop aborted every remaining `addJob` call) and the
  reply names exactly how many succeeded, never claiming full success when it wasn't. No
  distributed/saga transaction was built — a partial batch is a real, valid, list-visible
  set of Jobs, not a rolled-back attempt.

**Consequences.**

- No new idempotency-key table, no in-memory lock, no generic distributed session
  framework — every guarantee here is enforced at the PostgreSQL level (one conditional
  `UPDATE`), the same reasoning ADR-0029/ADR-0034 already established for the Worker API.
- Resolves OD-35 (TTL length: 60 minutes, configurable) and OD-12 (independent Jobs, no
  grouping entity).
- A department with an Album template whose slot set later changes doesn't affect an
  in-progress conversation — `pick-template.ts` snapshots the Template's slots into the
  wizard payload at pick time (`WizardSlot[]`), and `createJob` re-validates against the
  _live_ Template at confirmation regardless, so the snapshot is a conversational
  convenience only, never a trust boundary.

**Status:** DECIDED. Resolves OD-12, OD-35.

---

## ADR-0038 — Telegram reuses the File/Job application services verbatim; no new artifact lifecycle

**Context.** Phase 8 brief §22–24 asks how Telegram-collected media becomes a Job input
without duplicating File Gallery rules or inventing a temporary-upload concept Studio
doesn't otherwise have. Legacy guessed a MIME type from the downloaded URL's extension and
uploaded directly to disk from the bot — a known defect (`docs/legacy/known-issues.md`).

**Decision.**

- **A Telegram-collected file becomes an ordinary `GALLERY_ASSET` File**, uploaded through
  the same `features/files/use-cases/upload-file.ts` the dashboard's own upload form
  calls — full content-type sniffing from the downloaded bytes (never Telegram's declared
  media type or a URL-extension guess), the same size limits, the same department scoping
  (`uploadedByUserId`/department always the linked User's own — never a
  cross-department authoring surface via Telegram, even for ADMIN). A slot's declared
  `TemplateAssetKind` is checked against the _sniffed_ kind after upload — a video sent for
  an `AUDIO` slot is rejected exactly as if the mismatch had been submitted from the
  dashboard.
- **No new "temporary upload" or Telegram-specific `JOB_ARTIFACT`-on-input concept was
  built.** Every File the dashboard's Job-creation form can reference is already an
  ordinary, persistent Gallery File chosen from existing assets — Telegram's own uploads
  simply join that same pool the moment they're uploaded, consistent with how the
  dashboard has always worked. This means there is no cleanup/lifecycle design needed for
  "abandoned" Telegram uploads (§24/§53): a file uploaded mid-conversation that never ends
  up in a confirmed Job is not different from a web user uploading to the Gallery and never
  using it in a Job — an ordinary, reusable, explicitly-deletable Gallery asset, not a
  leak. Building real `JOB_ARTIFACT`-on-input semantics (a distinct temporary category with
  its own retention window) is deferred to whenever a real artifact-lifecycle feature
  exists to justify it — Phase 7 already left `JOB_ARTIFACT` creation itself unimplemented
  on the _output_ side for the identical reason (no consuming feature yet).
- **No Telegram-specific aspect-ratio validation was added.** The dashboard's own
  `create-job.ts`/`resolve-job-assets.ts` do not compare an uploaded image's dimensions
  against a Template slot's `imageRatio` either — OD-14 (the tolerance value) is still
  open, and no feature performs this comparison yet. Adding a Telegram-only check here
  would give Job creation two different validation behaviors depending on entry point,
  which Phase 8 brief §66 explicitly forbids. Legacy's own check used exact float equality
  (a known bug) — not reproduced either way, on either surface.
- **The Album/track loop calls the unmodified `createJob` use case once per track** — no
  Prisma call, no Job-domain logic, is written inside the Telegram feature at all (Phase 8
  brief §20). `cancelAllJobsForTelegram` (the one genuinely new piece of Telegram-side
  orchestration) is likewise a loop over the unmodified single-Job `cancelJob` use case,
  scoped to the actor's own Department's cancelable Jobs — not a new Jobs-feature
  bulk-cancel capability (`CLAUDE.md` §11 still defers that).

**Consequences.**

- `docs/domain/files.md`'s OD-19 ("one-off Telegram/upload inputs: artifact or
  promotable?") is answered for Telegram specifically: **promotable-by-default is
  moot** because there is no separate "temporary" state to promote _from_ — every
  Telegram upload is already a first-class Gallery asset. The general "does a Job's input
  File ever need a JOB_ARTIFACT-like temporary category" question stays open for the
  _output_ side, unaffected.
- Telegram inherits every future improvement to `upload-file.ts` (dedup notices, new
  allowed types, size-limit changes) automatically, with zero Telegram-side code changes —
  the whole point of reusing the use case verbatim.
- Resolves the file-handling half of OD-19 for Telegram's input path.

**Status:** DECIDED.

## ADR-0039 — Delivery pipeline: rendered-result acceptance, media processing, delivery orchestration, and YouTube connection model

> **Superseded in part, ADR-0041.** The YouTube-delivery half of this ADR (the
> `YouTubeTarget` model, `DeliveryAttempt`, the `RENDERED -> DELIVERING -> UPLOADED`
> path, the daily upload quota) was removed — Studio no longer uploads rendered Jobs to
> YouTube. The **media-processing** half (rendered-result acceptance, `ffmpeg`-based
> screenshot/thumbnail generation, artifact File creation) remains fully in effect,
> unchanged — see ADR-0041 for exactly what was kept versus removed.

**Context.** Phase 9 completes the render pipeline `RENDERED -> Delivery -> UPLOADED`
that Phases 6–7 deliberately left unbuilt (docs/domain/jobs.md "Completion & delivery").
Legacy's version had five real defects this phase must not reproduce: fire-and-forget
delivery (`uploadJobFile` returned before `uploadJobToYoutube`/`uploadJobToTelegram`
resolved), a YouTube failure silently swallowed except for a server log line, unsafe
`exec()`-built ImageMagick/`ffmpeg` shell commands, no delivery idempotency (a retried
Worker upload could re-trigger a second YouTube publish), and a hard-coded global upload
cap with no per-channel concept. See `qtical-backend-node/src/render/job/job.service.ts`
(`uploadJobFile`, `uploadJobToYoutube`, `uploadJobToTelegram`, `screenshot`,
`convertScreenshot`) and `src/youtubeapi/youtubeapi.service.ts` (`insertVideo`,
`setVideoThumbnail`).

**Decision.**

**1. Rendered-result acceptance is a new Worker endpoint, idempotent by construction.**
`POST /api/v1/worker/jobs/:id/result` (docs/integrations/worker-api.md §6, closing the
gap that section left open) takes the raw video bytes as the request body — not
multipart — so `defineRouteHandler` needed no new body-parsing capability; the handler
reads `request.arrayBuffer()` directly, exactly like `/api/files/[fileId]`'s GET response
is raw bytes in the other direction. `features/delivery/use-cases/accept-job-result.ts`
is the only place idempotency/concurrency for this endpoint is decided: a Job not in
`RENDERING` that already has a `videoFileId` is recognized as a duplicate Worker request
and returned as-is (no reprocessing, no second delivery run); a genuine race between two
concurrent result submissions is resolved by the same atomic conditional `UPDATE ...
WHERE state = 'RENDERING'` pattern every other `Job.state` writer uses
(`transitionJobRow`) — the loser rolls back the artifacts it already generated and
re-reads the Job to return the winner's result idempotently, never erroring a legitimate
duplicate.

**2. Media processing uses `ffmpeg` only — ImageMagick was deliberately not migrated.**
Legacy used `fluent-ffmpeg` for the screenshot (`ffmpeg().screenshots(...)`, fixed
`00:00:04.000` offset, kept) and a separate `exec('convert ... -resize x150 ...')` call
for the thumbnail. Studio's `ffmpeg`'s own `scale` video filter covers the resize need
exactly, so `server/adapters/media/ffmpeg-adapter.ts` does both steps with one native
dependency instead of two — every invocation is `execFile` with a fixed argument array,
never a template-built string, never `shell: true` (docs/security/security.md §6,
verified against a real 2-second test video during manual verification, including the
"seek offset past a short render's actual duration" edge case, where `ffmpeg` exits `0`
but writes nothing — `generate-render-artifacts.ts` checks the output file's actual size,
not just the exit code, before deciding the primary attempt succeeded). All filesystem
work happens in a private `mkdtemp` directory removed in `finally`; three `JOB_ARTIFACT`
Files (video, screenshot, thumbnail) are created sequentially with a rollback-on-failure
discipline mirroring `uploadFile`'s own storage-then-DB cleanup.

**3. Delivery orchestration is a synchronous, awaited call — never fire-and-forget.**
`features/delivery/use-cases/deliver-job-result.ts` runs inside the same Worker request
that accepted the result (docs/integrations/youtube.md "Delivery reliability" — the
direct fix for legacy's `this.uploadJobToYoutube(job); this.uploadJobToTelegram(job);`
unawaited calls). Telegram is a **best-effort notification** (legacy behavior kept
exactly: failure is logged, never blocks the Job, never becomes a `DeliveryAttempt` row).
YouTube is a **required delivery** when `Job.deliverToYouTube` is true: its outcome is
recorded in a new `DeliveryAttempt` row (one per attempt, `PENDING` committed _before_
the external call — the actual durability guarantee: a process crash mid-upload leaves an
accurate, retryable record, not a lost one) and drives the Job through
`RENDERED -> DELIVERING -> UPLOADED`/`ERROR` using the Phase 6 state machine's own,
already-existing edges — no second Job lifecycle was invented.

**4. A dedicated `ERROR -> DELIVERING` escape hatch, not a general graph edge.**
"Retry delivery only" (resolves OD-13 for YouTube) must move an `ERROR` Job back into
`DELIVERING` without re-rendering it — but `ERROR` must stay reported as _terminal_ by
`isTerminalState` for its other caller (`update-job-progress.ts`/`update-job-duration.ts`
rejecting a Worker report against a dead Job). Adding `ERROR -> DELIVERING` to
`job-state-machine.ts`'s general `TRANSITIONS` map would silently break that. Instead,
`features/delivery/use-cases/retry-job-delivery.ts` calls `transitionJobRow` directly —
the exact, already-documented escape hatch CLAUDE.md §11/ADR-0029 describe for "a new
state-changing operation whose legality `transitionJob`'s general pre-check doesn't fit."
The atomic conditional `UPDATE ... WHERE state = 'ERROR'` is still the only real
enforcement, identical in kind to every other `Job.state` writer.

**5. YouTube connection is a verified refresh-token entry, not a self-service OAuth
consent flow.** `docs/integrations/youtube.md`'s original `YouTubeTarget` design assumed
a full "Connect with Google" web flow; this phase deliberately narrows that to entering a
refresh token obtained out-of-band (Google's OAuth Playground or an equivalent one-time
flow against Studio's own registered OAuth client) — the same "credential obtained
elsewhere, entered once" trust model `WORKER_API_KEY` already uses. Studio verifies the
token immediately by calling the real YouTube API (`channels.list`) before storing
anything, so a bad/expired token is rejected at connection time, not discovered on the
next delivery attempt. The refresh token (and a short-lived cached access token) are
encrypted at rest with AES-256-GCM (`server/adapters/youtube/token-cipher.ts`,
`YOUTUBE_TOKEN_ENCRYPTION_KEY`) — never plaintext, never logged, never returned to a
client. `YouTubeTarget` is **department-scoped** (resolves OD-36 per its own
recommendation), with `youtube:manage` at the same `MANAGER+` floor as
`template:manage`. A full OAuth consent-screen UI remains a documented, deliberately
deferred future enhancement (§ "Out of scope" below) — it is a self-service UX
improvement, not a requirement for the delivery pipeline to function correctly and
safely.

**6. YouTube upload keeps legacy's hard-coded privacy exactly.** `privacyStatus: private`,
`madeForKids: false` — never configurable per Job/Template this phase (OD-37 stays open).
Tag substitution matches legacy's `{{layer}}` replacement and unresolved-placeholder-drop
behavior exactly, but deliberately drops legacy's dead `excludeTags` set
(`docs/integrations/youtube.md` "Tags", already documented before this phase).

**7. Artifact cleanup is a safe, idempotent primitive — not wired to a scheduler.**
`features/delivery/use-cases/cleanup-job-artifacts.ts` hard-deletes only the rendered
video File (never screenshot/thumbnail) once a Job reaches `UPLOADED` and — when YouTube
delivery was required — only after a `SUCCEEDED` `DeliveryAttempt` exists for it. It is
reference-aware by construction (a `JOB_ARTIFACT` video is created once and referenced
only by its own Job's `videoFileId` — never a Template default or another Job's input, so
no second-dependency check is needed the way Gallery Assets need
`assertNoActiveJobDependencies`), and failure-tolerant (a missing row or a storage error
never throws — logged, and the Job's own state is untouched either way). **Not
auto-triggered this phase** — OD-18's grace-period/scheduling question stays open (no
durable-work mechanism exists yet, OD-40); this is the tested primitive a future scheduled
sweep calls.

**Consequences.**

- Resolves the "Rendered/Uploaded state timeline" half of docs/domain/jobs.md's
  "Completion & delivery — still not implemented" section; both are now real.
- New tables: `DeliveryAttempt`, `YouTubeTarget`; new columns:
  `Job.videoFileId`/`screenshotFileId`/`thumbnailFileId`, `Template.youtubeTargetId`. No
  new background-job/queue infrastructure — OD-40 remains open for exactly the pieces this
  phase didn't need one for (see below).
- `JOB_ARTIFACT` (declared in the schema since Phase 4, ADR-0024) now has its first real
  writer.
- Every delivery-triggering write is authorized through the existing `job:manage`/
  `youtube:manage` capabilities — no Telegram/Worker-style parallel authorization surface
  was introduced.

**Out of scope, deliberately** (do not build without a new decision):

- A self-service "Connect with Google" OAuth consent-screen flow (point 5 above).
- Any background-work/queue mechanism (BullMQ, pg-boss, a cron sweep) — OD-40 is
  unaffected by this phase; delivery's durability guarantee is "the intent is recorded and
  retryable," not "automatically retried after a crash."
- Automatic/scheduled artifact cleanup, a configurable grace period (OD-18).
- Per-YouTube-target upload quota (the global cap from ADR-0030 is unchanged; OD-01's
  per-target half stays open even though `YouTubeTarget` now exists, since no concrete
  quota-per-channel requirement was given).
- A `retriedByUserId`-style audit trail beyond `DeliveryAttempt.triggeredByUserId`
  (`null` = automatic, a user id = manual retry) — sufficient for this phase's needs.

**Status:** DECIDED.

---

## ADR-0040 — Per-Worker API Keys with Department scope; YouTube Targets and Worker

identity move to ADMIN-only, many-to-many Department infrastructure; Template Department
transfer

> **Partially superseded, ADR-0041.** This ADR's YouTube-Target half (point 3 below —
> `YouTubeTarget.departments` many-to-many, `youtube:manage` moving ADMIN-only) no longer
> applies: `YouTubeTarget` and `youtube:manage` were removed entirely, since Studio no
> longer uploads to YouTube. The Worker API Key half (points 1–2) and the Template
> Department transfer half (point 4) are fully unaffected and remain in effect.

**Context.** ADR-0032 accepted a single, shared, non-departmental `WORKER_API_KEY` as
the simplest secure starting point, explicitly leaving the door open to "a new
`WorkerCredential` table and a new ADR" if Studio ever needed multiple Workers with
independent revocation or Department scoping. That need arrived: a Studio deployment
serving several Departments wants to run separate Worker processes per Department (or
per Department group), each holding a credential that can only claim and update Jobs
belonging to the Departments it was actually issued for — and wants any leaked/misused
key's blast radius limited to its own scope, not the entire Job queue.

Separately, `YouTubeTarget` (ADR-0039) was designed department-scoped by a single FK,
`MANAGER+`-manageable — but a real channel is commonly shared across several
Departments' Templates, and connecting/managing a channel is closer to system-wide
infrastructure configuration (the same category as choosing which Departments a Worker
credential may serve) than to a Department-local operation a MANAGER should own.

Finally, a Template's Department was treated as fixed at creation — correct as far as it
went, but ADMIN (who already operates across every Department) had no way to correct a
Template authored into the wrong Department without deleting and recreating it, which
`docs/domain/templates.md`'s soft-delete design makes irreversible and historically
messy.

**Decision.**

1. **`WorkerApiKey` replaces `WORKER_API_KEY` entirely — no dual-mode fallback.** A new
   `WorkerApiKey` model (`id`, `name`, `keyHash` — SHA-256, `@unique`, doubling as the
   authentication lookup index — `status: ACTIVE | REVOKED`, `departments` — implicit
   many-to-many with `Department`, `createdByUserId`, `lastUsedAt`, timestamps),
   ADMIN-managed (`worker_key:manage`, ADMIN-only) via a full CRUD UI at `/worker-keys`:
   create (name + at least one Department, secret shown exactly once, never re-displayed
   or stored anywhere retrievable), revoke/reactivate (never a hard delete — history
   stays inspectable), and edit-Department-scope (full replace, never diffed — mirrors
   how a Template's asset list and a `YouTubeTarget`'s Department set are already
   replaced wholesale on every edit). The trust model is a direct copy of `Session`'s
   (ADR-0020): only a hash is ever stored, so a database read alone never yields a usable
   credential. `@/server/worker-auth`'s `authenticateWorker` is the sole place this
   credential is read, hashed, or compared — mirroring `@/server/auth/session.ts` being
   the sole boundary for human sessions — and resolves a `WorkerAuthContext {
workerApiKeyId, allowedDepartmentIds }` once, at authentication, which
   `defineRouteHandler`'s `authenticate` hook hands straight to every Worker Route
   Handler as `ctx.auth` (a minimal, backward-compatible extension to
   `defineRouteHandler` — a new `TAuth` generic, defaulting to `void` for every
   non-Worker route).
2. **Department scope is enforced server-side, never client-supplied, and folded into
   the atomic claim query itself — not a post-hoc check.** `claimNextJobRow`'s `SELECT
... FOR UPDATE SKIP LOCKED` now filters `WHERE "departmentId" = ANY(allowedDepartmentIds)`
   as part of the same atomic statement (ADR-0029's guarantee is unchanged, just
   narrowed) — a scoped-out Job is never even considered for locking, let alone
   transiently claimed before a rejection could apply. Every other Worker Job operation
   (`getJobForWorker`, `transitionJobForWorker`, `updateJobProgress`,
   `updateJobDuration`, `acceptJobResult`) calls the same
   `assertWorkerDepartmentAccess(allowedDepartmentIds, job.departmentId)` gate before
   touching a _specific_ Job id — safe as a plain pre-check (not folded into an atomic
   conditional update) because `Job.departmentId` is immutable once created (see point 4
   below), so there is no concurrent-Template-transfer race to guard against the way the
   claim query's row-selection needs one. Every rejection is `not_found` (404), never
   `forbidden` (403) — the same 403-vs-404 discipline every dashboard feature already
   applies to cross-department access, now extended to the Worker's own credential scope
   so a scoped-out Worker cannot distinguish "exists in a Department I can't reach" from
   "doesn't exist."
3. **`youtube:manage` and the new `worker_key:manage` both move to ADMIN-only** (was
   `MANAGER+`, Department-scoped, for YouTube). Connecting a channel or issuing a Worker
   credential and choosing which Departments may use it is system-wide infrastructure
   configuration — the same category as `department:manage`, not a Department-local
   operation. `YouTubeTarget.departmentId` (a single FK) becomes `departments`, an
   implicit many-to-many with `Department` — one channel now serves several Departments,
   matching `WorkerApiKey`'s shape and real-world channel reuse. `youtubeChannelId`
   becomes globally unique (was unique per-Department) since a channel is no longer
   owned by exactly one. Non-ADMIN users are unaffected in what they can _do_: `USER`/
   `MANAGER` still select an already-connected, already-scoped channel when authoring a
   Job/Template, filtered to Targets assigned to their own Department
   (`findConnectedYoutubeTargetForDepartment`) — gated by `template:manage`/`job:manage`
   exactly as before, never by `youtube:manage`.
4. **ADMIN may transfer a Template to a different Department; MANAGER/USER cannot, even
   via a crafted request carrying `departmentId`.** `updateTemplate` gates the transfer
   branch with `requireRole(actor, "ADMIN")` — not just a capability floor a crafted
   payload could otherwise slip past — and only when `input.departmentId` actually
   differs from the Template's current Department; a non-ADMIN's `departmentId` is
   silently ignored whenever it would differ (never trusted from the client, matching
   every other cross-department input in this codebase). The target Department must
   exist, and every dependent reference is **re-verified against the target Department,
   not the original**: `verifyAssetFileReferences`/`verifyYoutubeTargetReference` already
   do exactly this check for a plain same-department edit, so a transfer that would leave
   the Template pointing at another Department's Files/Target is rejected with the same
   clean `business_rule` error, never silently transferred anyway.
   **No historical-integrity mechanism needed for this** — `Job.departmentId` is copied
   onto the Job row once, at creation, from the Template's Department _at that time_; it
   is a plain stored column, never a live join through `Job.templateId`. Moving a
   Template to a different Department later does not, and cannot, retroactively change
   which Department any existing Job belongs to. This is also exactly what makes point 2
   above race-free without needing to fold the Worker's Department check into an atomic
   conditional update the way the claim query does.

**Consequences.**

- New table: `WorkerApiKey`. `YouTubeTarget.departmentId` (single FK) is replaced by
  `departments` (implicit m2m) — a real, hand-verified-empty-table migration, not a
  destructive one (no `YouTubeTarget` rows existed at migration time in every
  environment this was applied to).
- `WORKER_API_KEY` is removed from `@/server/env` entirely — no environment-variable
  fallback path exists or should be added; every existing Worker deployment must be
  reissued a `WorkerApiKey` via `/worker-keys` before this ships.
- `Department` navigation/nav item visibility, `YouTube` navigation, and the new
  `Worker API Keys` navigation item are all ADMIN-only in `@/lib/navigation.ts` — every
  one of the pages behind them independently re-checks the actor's role server-side
  (`ForbiddenPage` gate), not just via the nav's own `minRole` filter, matching every
  other management page in this codebase. Non-ADMIN users retain their own Department's
  name in the sidebar/profile area (`CurrentUser.departmentName`) even without the
  `/departments` management page.
- `job-repository.ts`'s module doc comment is corrected: Worker-facing operations are no
  longer blanket "not department-scoped" — only `claimNextJobRow` folds the scope into
  its own atomic query; every other Worker operation is scoped one layer up, in the use
  case, via `assertWorkerDepartmentAccess`.
- Resolves OD-27 (Worker-auth mechanism, superseding ADR-0032's static-key answer) and
  OD-36 (YouTube Department scoping, superseding ADR-0039's single-FK answer).

**Out of scope, deliberately** (do not build without a new decision):

- Per-Worker rate limiting, per-Worker request idempotency keys beyond what ADR-0034
  already established (unaffected by moving from one shared key to many scoped ones).
- A generic multi-tenant RBAC/permission-table system — Studio still has exactly three
  fixed roles; `worker_key:manage` (and, at the time, `youtube:manage` — since removed
  along with the rest of YouTube delivery, ADR-0041) were entries in the existing fixed
  capability registry, not a new mechanism.
- Any Worker-initiated Department self-service (a Worker cannot request its own scope
  change) — Department scope is exclusively ADMIN-assigned.

**Status:** DECIDED.

---

## ADR-0041 — Remove YouTube upload entirely; simplify the Job lifecycle to end at `RENDERED`

**Context.** Product decision: Studio does **not** upload rendered Jobs to YouTube at
this stage. ADR-0039 had built a real YouTube-delivery pipeline (channel connections,
OAuth token exchange/encryption, a `DELIVERING`/`UPLOADED` post-render leg, a
`DeliveryAttempt` durability ledger, a global daily upload quota) on top of Phase 6's
render pipeline. None of that infrastructure has a remaining purpose — keeping it around
unused (or worse, half-wired) would be dead weight and a standing security/maintenance
liability (an unused OAuth client secret, an unused token-encryption key, an unused
admin surface). The instruction was explicit: remove the _feature_ from the application
architecture, database, services, API flow, dependencies, configuration, and
documentation — not just hide it from the UI.

**Decision.**

1. **The Job lifecycle now ends at `RENDERED`.** `JobState.DELIVERING`/`UPLOADED` are
   removed from both the Prisma enum and `features/jobs/domain/job.ts`'s `JOB_STATES`.
   `RENDERED` is now itself terminal (`isTerminalState`) — the moment
   `accept-job-result.ts` accepts the Worker's rendered result and the atomic
   `RENDERING -> RENDERED` transition commits, the Job is done. No further transition is
   attempted automatically.
2. **`POST /api/v1/worker/jobs/:id/result` (legacy `POST /jobs/:id/upload`) is
   unchanged in shape and stays mandatory** — this is still the Worker's only way to
   hand Studio the rendered bytes, and Studio still generates a screenshot + thumbnail
   from it (`generate-render-artifacts.ts`, `ffmpeg`-only, unchanged) for the dashboard's
   own Job detail view. What changed is only what happens _after_ the atomic transition
   commits: `accept-job-result.ts` no longer calls a delivery orchestrator — it sends one
   best-effort "rendered" Telegram notification (if the creator is linked) and returns.
   No YouTube API call, no external upload, ever, from this endpoint.
3. **Legacy Worker state codes `6` (Uploading) and `7` (Uploaded) are no longer mapped**
   (`legacy-state-mapping.ts`) — a Worker sending either now gets the same `422
validation` error as any other unrecognized value, naming the supported values. This
   is a genuine, intentional Worker-contract change: there is no Studio state for either
   concept anymore.
4. **Removed entirely, database included:** `YouTubeTarget` model (+
   `YouTubeTargetStatus` enum), `DeliveryAttempt` model (+ `DeliveryProvider`/
   `DeliveryStatus` enums — this model existed _only_ for YouTube's durable delivery
   ledger; Telegram notification was always best-effort and never wrote a row here),
   `Template.youtubeTargetId`/`description`/`tags` (their only purpose was configuring a
   YouTube upload — description/tags had no other consumer), `Job.deliverToYouTube`/
   `deliveredAt`/`uploadedAt`, the `Department ↔ YouTubeTarget` many-to-many join table,
   the global daily upload quota (`JOB_UPLOAD_DAILY_CAP`, its advisory-lock logic in
   `job-repository.ts`, ADR-0030 — its only purpose was capping YouTube-upload-enabled
   Jobs), `TelegramWizardStep.ASK_DELIVERY` (Single Track's "deliver to YouTube?"
   question — it now opens straight into asset collection, `trackCount` fixed at 1, using
   the same track-cursor logic Album already used for its own first track), the entire
   `features/youtube/` feature (domain, repository, use-cases, actions, schemas,
   components), `src/server/adapters/youtube/` (token cipher, YouTube API client), the
   `/youtube` nav item/page, `googleapis` (npm dependency — confirmed used nowhere else),
   `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/`YOUTUBE_TOKEN_ENCRYPTION_KEY` (env vars),
   `youtube:manage` (authorization capability).
5. **Verified empty before the migration** — `youtube_targets`, `delivery_attempts` had
   zero rows; no `Job` had `deliverToYouTube = true`; no `Template` had a non-null
   `youtubeTargetId`/non-null `description`/non-empty `tags` in every environment this
   was checked against. The migration drops these tables/columns outright — a real
   schema change, not `db push` — but carries **zero data-loss risk** given that state; a
   deployment that somehow does carry such data must review it before applying this
   migration, since (per point 4) it is unrecoverable afterward.
6. **`Job.videoFileId`/`screenshotFileId`/`thumbnailFileId` and their `ffmpeg`-based
   generation are kept, unchanged.** These are general "view the rendered result in the
   dashboard" functionality (download/preview a Job's video and thumbnail), independent
   of whether that result is _also_ pushed anywhere else — removing YouTube does not
   remove them. `cleanup-job-artifacts.ts`'s eligibility check simply moved from
   `UPLOADED` to `RENDERED` (the new terminal success state); its YouTube-specific
   "delivery must have actually succeeded" guard is gone along with the model it
   referenced.
7. **`retryJobDelivery` (`ERROR -> DELIVERING`) and its Server Action/route are
   removed** — there is no delivery to retry. Job Retry itself (`retryJob`,
   `ERROR`/`CANCELED -> new QUEUED Job`, ADR-0031) is completely unaffected; it never was
   the same operation.

**Consequences.**

- `docs/integrations/youtube.md` is deleted outright — there is no YouTube integration
  to document. `docs/integrations/worker-api.md`/`docs/domain/jobs.md`/
  `docs/domain/templates.md`/`docs/domain/authorization.md`/CLAUDE.md all updated to
  describe the simplified lifecycle and state the removal explicitly, so a future reader
  never has to guess whether "no YouTube" is an oversight or a decision.
- OD-01 (upload cap model) and OD-37 (YouTube privacy configurability) are both closed
  as **moot** — the feature they were about no longer exists.
- A future "add YouTube (or any external) delivery back" requirement is a **new**
  decision, not a revert of this one — it would need its own connection-security review
  (OAuth client credentials, token storage) exactly as ADR-0039 originally did, not a
  resurrection of the removed code verbatim.
- No historical Job record was corrupted or deleted by this change (point 5) — Jobs
  remain permanent, never-deleted records (ADR-0005), and the small number of columns
  removed from `Job` (`deliverToYouTube`/`deliveredAt`/`uploadedAt`) carried no data in
  any environment this was verified against.

**Out of scope, deliberately** (do not build without a new decision):

- Any replacement delivery destination (YouTube or otherwise) for a rendered Job.
- A generic "delivery provider" abstraction sized for a future integration that doesn't
  exist yet — speculative infrastructure CLAUDE.md §12 asks not to build ahead of a real
  requirement.

**Status:** DECIDED.

## ADR-0042 — Native `color-scheme` dark-mode fix; `/api/v1/{service}` versioning; Template Department immutability split from transfer; visual Job asset File Picker

**Context.** A UI/API/security hardening pass raised four independent issues: (1) native
`<select>` popups and browser form-control chrome rendered with a light background in
Dark Mode, even though every Radix-based overlay (`DropdownMenu`, `Sheet`) already
themed correctly; (2) the Worker REST API lived at `/api/worker/v1/...` — service before
version, backwards from a sane versioning convention; (3) `updateTemplate` (Phase
11/ADR-0040) let ADMIN change a Template's `departmentId` as one branch of the ordinary
edit path, which — despite being ADMIN-gated — conflated "edit" and "transfer" as one
operation, contrary to a firmer requirement that Template Edit must be _structurally_
incapable of moving a Template between Departments, with transfer kept as a genuinely
separate mechanism; (4) Job asset File selection was a plain `<select>` of filenames,
with no thumbnail, no search, and no inline upload — every Gallery File had to already
exist and be found by name alone before a Job could be created.

**Decision.**

1. **Dark Mode form-control fix: the CSS `color-scheme` property, not a component
   rewrite.** `:root` declares `color-scheme: light`, `.dark` declares `color-scheme:
dark` (`src/app/globals.css`). This is the actual root cause: browser-native chrome
   (native `<select>` popups, scrollbars, spell-check underlines) is drawn by the OS/
   browser itself and is only theme-aware through this CSS property — entirely
   orthogonal to the page's own `bg-popover`/token-driven CSS, which every Radix overlay
   in this codebase (`DropdownMenu`, `Sheet`) already used correctly. Because
   `next-themes`'s `attribute="class"` + `enableSystem` always resolves "System" down to
   toggling the same `.dark` class on `<html>`, one class-scoped declaration (no `@media`
   block needed) covers all three theme states. No component was rewritten; no color was
   hardcoded.
2. **API versioning convention: `/api/v{version}/{service-or-resource}/...`** — version
   segment first. The Worker API physically moved from `src/app/api/worker/v1/**` to
   `src/app/api/v1/worker/**` (a real directory move, since Next.js App Router routes are
   the directory tree — not a redirect or a duplicate route). Every reference across the
   codebase (`worker-auth`, `accept-job-result.ts`, `jobs/README.md`, every doc that
   mentioned the old path) was updated in the same change; **no backward-compatible old
   route was kept** — the Worker is in-repo, its own authentication/Department-scoping
   logic is untouched, and nothing external depends on the pre-move path, so keeping a
   duplicate would have been dead weight, not a compatibility requirement.
3. **Template Department immutability split from transfer, structurally, not just by
   convention.** `templateInputSchema` (backing both create's base shape and update)
   has **no `departmentId` field at all** — a client-submitted value is stripped by Zod
   before `updateTemplate` ever sees it. `updateTemplate`/`updateTemplateWithAssets`
   were rewritten to never read, derive, or forward a `departmentId` under any
   circumstance — even a hypothetical caller that bypassed the schema layer entirely
   would find no code path left that writes it. `createTemplateSchema` (a
   `z.intersection` of `templateInputSchema` with an optional `departmentId`) is now the
   **only** schema that ever accepts one, honored only for ADMIN, only at creation.
   Transfer became its own operation: `transferTemplateDepartment` (use case, dedicated
   `transfer-template-department.schema.ts`, dedicated Server Action, and the **only**
   repository function that ever writes `Template.departmentId`), gated by
   `requireRole(actor, "ADMIN")` — not just the `template:manage` floor a MANAGER also
   holds. Rendered as a separate "Transfer department" control on the Template detail
   page, never inside the edit form. See `docs/domain/templates.md` "Department
   transfer" for the full mechanism (unchanged from ADR-0040: target-department
   existence check, re-verification of dependent File references against the _target_
   Department, no historical-integrity mechanism needed since `Job.departmentId` is a
   plain column copied once at Job creation).
4. **Job asset File Picker** (`features/files/components/file-picker.tsx`) replaces the
   plain `<select>` of filenames for `IMAGE`/`AUDIO`/`VIDEO` slots with a `Sheet`-based
   visual picker: thumbnails (reusing the same authenticated `/api/files/[fileId]`
   serving route `FileCard` already uses — no new media/thumbnail pipeline), live
   filename search, and an inline upload form that calls the **same**
   `uploadFileAction` the `/files` Gallery page uses — no second storage or validation
   path. A freshly uploaded file is auto-selected immediately, no extra step. Backed by
   a new, narrow `searchGalleryFilesAction` (`features/files/use-cases/
search-gallery-files.ts`) — same `file:manage` (USER+) floor and same
   `departmentScopeFilter` department scoping as the existing `listGalleryFiles`, plus
   an **advisory-only** `departmentId` narrowing parameter honored strictly for ADMIN
   (`ListFilesFilters.departmentId` in `file-repository.ts` — spread _after_
   `departmentScopeFilter(actor)`, so a non-ADMIN's own department can never be
   overridden by a client-supplied value). This narrowing is UX convenience only, never
   a security boundary by itself: the actual Job-creation-time file resolution
   (`features/jobs/use-cases/resolve-job-assets.ts`) already re-validates every
   submitted `fileId` against the Template's own Department server-side, unchanged by
   this work — a crafted `fileId` the picker never displayed is rejected there
   regardless of what the picker showed.

**Consequences.**

- Dark Mode's native form controls now theme correctly everywhere in the app, with zero
  risk to Light Mode (a `color-scheme` value is additive metadata, not a color
  override) and zero per-component changes needed for any future native `<select>`.
- `/api/v1/worker/...` is now the only Worker API path; `docs/integrations/worker-api.md`
  and every other doc referencing the old path were updated in the same change described
  by this ADR.
- A Template's Department can never be changed by anything called "edit," for any role —
  closing the gap between ADR-0040's ADMIN-gated-but-still-edit-shaped transfer and a
  stricter "edit is structurally incapable of it" guarantee. The ADMIN transfer
  capability itself is fully preserved, just relocated to its own operation.
- Creating a Job now supports discovering and uploading Gallery Files inline, without
  leaving the Job form or needing to already know a file's exact name — while every
  existing Department-isolation and file-kind-matching guarantee
  (`resolve-job-assets.ts`) is completely unchanged.

**Status:** DECIDED.

## ADR-0043 — Worker compatibility audit: fix Studio to match the actual Worker's real HTTP contract

**Context.** Studio's Worker REST API had been designed and documented (Phase 7, ADR-0004/
ADR-0033/ADR-0034, later ADR-0040/ADR-0041/ADR-0042) against an _assumed_ contract —
never against the actual Worker's real source code
(`navaak-ae-renderer`, external repository). An explicit compatibility audit read that
repository in full — HTTP client, endpoint paths, request/response shapes, auth headers,
state codes, file download/upload behavior, the mid-render cancellation mechanism — and
found several concrete, previously-undetected defects that would have broken the real
integration outright. **The Worker is immutable** (an explicit constraint of this task):
every fix is on Studio's side.

**Decision — findings and fixes, most severe first.**

1. **The render pipeline could never have completed a single real render.** The actual
   Worker (`renderer/renderer.go`'s `next()`) reports three legacy per-stage state codes
   in sequence while rendering — `Downloading(2)`, `Started(3)`, `InProgress(4)` — all
   three mapping onto the same Studio `RENDERING` state
   (`legacy-state-mapping.ts`). Studio's state machine deliberately forbids a self-loop
   transition (tested, `job-state-machine.test.ts`) — so the _second_ of these calls
   (`Started`, immediately after the first genuinely moved `CLAIMED -> RENDERING`) was
   rejected with a `422 business_rule` error, aborting the render every time. Fixed by
   making `transitionJobForWorker` (the Worker-facing adapter only) treat "mapped target
   equals current state" as an idempotent no-op — the general state machine's no-self-loop
   invariant is untouched for every other caller.
2. **The rendered-result upload could never have succeeded, for three independent
   reasons.** The actual Worker's `UploadJob()`
   (`renderer/operator/upload.go`): (a) POSTs to `.../jobs/:id/upload`, not the
   previously implemented `.../jobs/:id/result`; (b) sends a real
   `multipart/form-data` body with the video under form field `"file"`, not raw bytes
   (the previously implemented handler read `request.arrayBuffer()` directly); (c)
   sends **no `Authorization` header at all** — it builds its `http.NewRequest`
   manually, unlike every other Worker call (which goes through `operator.Request()`,
   which does set `Authorization: Bearer <key>`). Fixed: the route was renamed to
   `.../upload`, now parses `request.formData()`'s `"file"` field, and authenticates via
   a new `authenticateWorkerLenient` (`@/server/worker-auth`) — a present header is
   still validated exactly as strictly as before; a missing one is tolerated
   (`allowedDepartmentIds: null`), with the Job's own state as the compensating gate.
   Additionally, the real Worker calls `ChangeState(Rendered)` (a bare `PATCH
.../state`) **before** uploading — `acceptJobResult` previously required strictly
   `RENDERING`, rejecting every real upload once that separate call had already landed;
   it now also accepts an already-`RENDERED`, no-video Job, using `[job.state]` (not a
   hardcoded `["RENDERING"]`) as the atomic transition's `fromStates` set.
3. **Every Job asset/Template download was broken.** The previously implemented
   `buildFileUrlFromRequest` returned an absolute URL
   (`${origin}/api/files/{id}`). The actual Worker's downloader
   (`renderer/operator/downloader.go`'s `download()`) resolves a non-`file://`
   reference by taking only the **path** portion of it and joining that onto its own
   configured `BaseURL` (`u.Path = path.Join(u.Path, addr)`) — handed a full URL, Go's
   `path.Join`/`path.Clean` collapses the `"://"` inside it into a mangled,
   unreachable request (verified by hand). Fixed: the builder now returns a relative
   path (`/api/files/{id}`) only.
4. **The empty-queue response would have been logged as a spurious error on every
   single poll.** The previously documented/implemented design returned `204 No
Content` (a deliberate ADR-0033 decision, made without the real Worker's code to
   check it against). The actual Worker's `Request()`
   (`renderer/operator/request.go`) treats any status `> 300` as an error; its
   caller (`renderer.go`) silences that error only when the text contains the literal
   substring `"Not Found"` — a check written for the legacy backend's `404 Not
Found` response, never updated. A `204` has no body, so the Worker's own
   `json.Unmarshal` failed with an unrelated message that doesn't contain "Not
   Found", logging a real error every ~10 seconds while idle (harmless to the render
   loop itself, but a confirmed defect). Fixed: `POST /api/v1/worker/jobs/next` now
   throws `notFoundError("Not Found")` for an empty queue.
5. **Every duration report was silently rejected.** The actual Worker's
   `SetDuration()` sends `{"duration": <int seconds>}` — the previously implemented
   route's body schema required a field literally named `durationSeconds`. Fixed at
   the route boundary only (`duration` accepted, mapped to Studio's internal
   `Job.durationSeconds` — the internal domain field name is unchanged).
6. **The real Worker's mid-render cancellation signal had no Studio counterpart at
   all.** The Worker's supervisor process (`worker/worker.go`'s `checkCancelJob`)
   polls, roughly every 5 seconds while actively rendering, `GET
{baseURL}/jobs/{activeJobId}` — no `/api` prefix, no credential — expecting the
   _legacy backend's_ exact response shape (`{"job":{"_id":...,"state":...}}` on
   success, `{"statusCode":404}` on a missing Job) to learn whether to kill the local
   AfterFX process. That literal URL is already the human-facing Job detail dashboard
   page, and a `page.tsx`/`route.ts` cannot co-resolve one path in the App Router.
   Fixed via `src/middleware.ts` — a **pure content-negotiation rewrite** (not an
   authorization decision; nothing here decides access, since there is no credential
   to decide about) that distinguishes a real browser (`Accept: text/html,...`) from
   the Worker's headerless `http.Get` and rewrites only the latter to a new internal
   handler (`src/app/api/internal/legacy-job-status/[jobId]/route.ts`) returning the
   exact legacy shape.
7. **No credential on three real Worker calls — a structural gap, addressed with
   bounded, explained compensating checks, not a silently accepted opening.** The
   result upload, the asset/Template download, and the cancel-status poll all send no
   Worker credential in the real Worker's actual code — this cannot be changed short
   of modifying the Worker, which is out of scope. Rather than either breaking these
   calls outright (requiring a credential that will never arrive) or opening the
   underlying endpoints with no scope at all, each gained its own narrow substitute
   gate: the upload requires the Job to be in an acceptable render state; File serving
   without any credential is limited to a File that is a genuine input of a Job
   currently `QUEUED`/`CLAIMED`/`RENDERING`
   (`findFileIfActiveJobInput`); the cancel-status poll returns the minimum possible
   information (an id already known to the caller, plus a coarse numeric state).

**Consequences.**

- `docs/integrations/worker-api.md` was substantially rewritten — every item this ADR
  fixes is documented with the specific Worker source line/behavior that justified it,
  and §7 ("Compatibility notes / risks") changed from "unconfirmed, coordinate before
  cutover" to a resolved record.
- `src/middleware.ts` is new — the first middleware in this codebase. It performs
  routing only, never an authorization decision; CLAUDE.md's "no authorization in
  Next.js middleware" rule is about the latter and is not violated by the former.
- Three endpoints now knowingly operate without a Worker credential
  (`.../jobs/:id/upload`, the asset/Template branch of `/api/files/[fileId]`, and the
  new `/jobs/:id` legacy cancel-status route) — a real, explained narrowing of Studio's
  security posture, bounded in each case as described above, not a blanket opening.
  A future Worker update that adds the missing `Authorization` header on these three
  calls would let the compensating checks be tightened or removed — that is a Worker
  change, out of scope here, and not required for correctness today.
- The Worker repository (`navaak-ae-renderer`) was read extensively but never modified —
  confirmed via `git status` before and after this work; any pre-existing local,
  uncommitted changes to it (unrelated to this task) were left untouched.

**Out of scope, deliberately:**

- Modifying the Worker to send the missing `Authorization` header on its
  upload/download/cancel-poll calls, or to stop expecting the legacy
  `{"job":{"_id":...}}` shape — the Worker is immutable for this task.
- A general-purpose Next.js middleware framework or routing layer — `src/middleware.ts`
  is scoped to the one literal path collision this phase needed to resolve, not a
  precedent for moving other logic into middleware.

**Status:** DECIDED.

## ADR-0044 — Give the Worker's downloaded files a real extension via a trailing, lookup-irrelevant filename segment

**Context.** After ADR-0043 fixed the Worker's asset/Template download URLs to be
relative paths, a user report surfaced a further real defect: `/api/files/{fileId}`
downloads (e.g. `http://192.168.100.141:3002/api/files/cmtsbmyqk0003mlhwf1xguuu2`) have
no file extension. The actual Worker's downloader
(`navaak-ae-renderer/renderer/operator/downloader.go`'s `download()`) saves a
downloaded URL's bytes to a local temp file named after `filepath.Base(addr)` — the
URL's **last path segment**, used verbatim. A bare `/api/files/{id}` URL has no
extension, so every asset/Template the Worker downloaded was saved locally with none —
breaking anything downstream that infers file type from the extension (Adobe's
`ImportOptions`/`replaceFootage`, used by the Worker's generated `.jsx` script, included).

**Decision.**

1. `/api/files/[fileId]/route.ts` moved to `/api/files/[fileId]/[[...rest]]/route.ts` —
   an **optional catch-all** trailing segment. `fileId` alone still resolves the File
   (identical behavior to before for every existing caller — the dashboard, `FileCard`,
   etc., none of which send a trailing segment); `rest` is read but **never used for
   lookup or authorization**, only present so a URL can carry a filename after the id.
2. `buildFileUrlFromRequest` (`src/app/api/v1/worker/_lib/build-file-url.ts`) gained an
   optional `filenameHint` parameter, appended (URL-encoded) as that extra segment when
   given: `/api/files/{id}/{filename}`.
3. `buildWorkerJobPayload`/`toWorkerAsset`
   (`features/jobs/domain/worker-job-payload.ts`) now pass the `JobAsset`'s own
   `fileOriginalName` — already captured at Job-creation time (ADR-0028), already
   validated at upload time to agree with the File's actually-sniffed content type
   (`resolveFileKind`, `features/files/domain/file-types.ts`) — as that hint. The
   extension in the resulting URL is therefore trustworthy, not an unverified
   client-supplied value used for anything security-sensitive: the route still serves
   bytes and `Content-Type` from the File's own stored `mimeType`/`storageKey`,
   completely independent of whatever the URL's trailing segment says.

**Consequences.**

- Every Worker-downloaded asset/Template now has a real, correct extension locally,
  matching its actual content.
- No existing caller of `/api/files/[fileId]` is affected — the route's URL shape for
  every non-Worker use is unchanged (no trailing segment sent, `rest` is `undefined`).
- The filename segment is cosmetic/functional for the Worker's local temp filename
  only; it carries no authorization weight and is never trusted for content-type
  determination — `Content-Type` still comes from the File's own server-side record.

**Status:** DECIDED.

## ADR-0045 — Job thumbnail, video duration & render time, and centralized status chips

**Context.** Jobs List and Job Detail showed only a text status badge and a raw
`{durationSeconds}s` number — no visual thumbnail, no distinction between a rendered
video's own duration and how long the render actually took, and a 4-variant status
badge that didn't clearly distinguish all 6 Job states. A product brief asked for a
thumbnail (placeholder before render, actual generated thumbnail after), an `HH:MM:SS`
duration overlay on the thumbnail, a separately-displayed render time, and clearly
distinguishable status chips — explicitly scoped to reuse existing architecture
wherever it already covers the need, not to introduce new backend infrastructure.

**Decision.**

1. **No thumbnail generation was added — it already existed.** Phase 9
   (`generate-render-artifacts.ts`, ADR-0039) already generates a screenshot and a
   small (150px-height) thumbnail via `ffmpeg` for every rendered Job, stored as a
   `JOB_ARTIFACT` File (`Job.thumbnailFileId`) atomically with the `RENDERING ->
RENDERED` transition. This phase only **surfaces** it in the UI (`JobThumbnail`,
   `features/jobs/components/job-thumbnail.tsx`), served through the existing
   `/api/files/[fileId]` route exactly like a Gallery File preview.
2. **`Job.thumbnailFileId` (and `startedAt`/`renderedAt`) moved from `SafeJobDetail`
   into the list-view `SafeJob` type** (`features/jobs/domain/job.ts`) and into the
   list `Prisma.JobSelect` (`SAFE_JOB_SELECT`, `job-repository.ts`) — the Jobs List
   needs a thumbnail and render time per row without a second per-row query.
   `videoFileId`/`screenshotFileId` stayed detail-only; the list never needs the full
   video or the larger screenshot.
3. **Render time is a new, narrow schema addition: populating the already-existing,
   previously-unused `Job.startedAt` column.** The column existed in the schema from
   Phase 6 but no code ever wrote to it. `transitionJobForWorker`
   (`features/jobs/use-cases/transition-job-for-worker.ts`) now sets it, exactly once,
   on the real `CLAIMED -> RENDERING` transition — ADR-0043's same-state-idempotency
   fix is what makes "exactly once" true, since the Worker's later same-bucket reports
   (`Started`/`InProgress`) are already short-circuited as no-ops before reaching the
   real-transition code path. No migration was needed — the column already existed,
   unused.
4. **`computeRenderSeconds(startedAt, renderedAt)`** (`features/jobs/domain/job.ts`) is
   the one render-time calculation, deliberately **not** `createdAt -> renderedAt`
   (includes queue wait) and **not** `claimedAt -> renderedAt` (includes
   asset-download time before the Worker actually starts rendering). Returns `null`
   for a missing or inconsistent (negative) pair, never a negative number.
5. **One shared duration formatter**, `formatDurationHHMMSS`
   (`src/lib/format-duration.ts`) — always `HH:MM:SS`, zero-padded, supports durations
   past 24 hours without wrapping, `"—"` for `null`/`undefined`/`NaN`/`Infinity`/
   negative input. Used for both the rendered video's own duration
   (`Job.durationSeconds`) and render time — two different values, one formatting
   function, never a `Date`-based format (a duration is not a timestamp).
6. **`JobStatusBadge` recolored** (`features/jobs/components/job-status-badge.tsx`) —
   using the existing `--success`/`--warning`/`--info` semantic CSS tokens
   (`globals.css`, already theme-aware in both Light/Dark, previously declared but
   unused anywhere in the app) layered onto the existing `Badge` component via the same
   `bg-{color}/10 text-{color} border-{color}/30` treatment already used for inline
   error banners elsewhere — no new color was invented, no new component variant was
   added to `badge.tsx` itself. Every state keeps its own distinct text label (status
   was never communicated by color alone even before this change); a small
   `aria-hidden` colored dot was added purely as an additional at-a-glance visual cue.
   Exactly the 6 states the current state machine has — `Uploading`/`Uploaded`
   (removed with YouTube upload, ADR-0041) were not reintroduced.

**Consequences.**

- Zero new database columns; `Job.startedAt` (existing, previously dead) is now
  written for the first time — a Job created before this change simply has `null`
  `startedAt`/render time until it next renders (no backfill attempted or needed —
  historical Jobs' other fields remain fully intact and readable).
- Thumbnail rendering adds no new request per Job row — the list query already
  includes `thumbnailFileId`; the browser fetches the small thumbnail image lazily
  like any other `<img>`, not a video/ffmpeg operation at request time.
- `JobThumbnail`/`JobStatusBadge`/`formatDurationHHMMSS` are each used from exactly
  one place per concern (Jobs List row, Job Detail page) — no duplicate formatting or
  color logic exists anywhere else in the codebase (verified by repository-wide
  search).

**Status:** DECIDED.

## ADR-0046 — Centralize technical-filename generation; give `/api/files/[fileId]` a real `Content-Disposition` filename

**Context.** A user report: opening/saving `/api/files/{fileId}` directly (e.g.
`http://localhost:3000/api/files/cmtsb9vtb0001ml6p8r53t5o7`) produces a downloaded file
with **no extension** — even though the File's own `originalName` (Gallery-displayed)
has one. Cause: the route (ADR-0025/ADR-0044) is deliberately identity-by-id, not
identity-by-path, so its URL never carries an extension by design — but the route also
never sent a `Content-Disposition` header, so a browser falls back to the URL's last
segment (the bare id) for a "Save As"/direct-navigation download, same failure mode
ADR-0044 already fixed once for the Worker's own downloader via a different mechanism
(the `[[...rest]]` filename-hint segment) — this is the browser-facing half of that same
class of bug, on a path ADR-0044 didn't touch.

Separately, while auditing this: `File.storedName`/`storageKey` generation
(`` `${randomUUID()}.${extension}` `` + `` `${departmentId}/${storedName}` ``) was
duplicated verbatim between `features/files/use-cases/upload-file.ts` (Gallery uploads)
and `features/files/use-cases/create-job-artifact.ts` (Worker render-result artifacts) —
against `docs/architecture/files.md`'s own "one module generates it" intent.

**Decision.**

1. `/api/files/[fileId]/[[...rest]]/route.ts` now sets
   `Content-Disposition: inline; filename="<ascii-fallback>"; filename*=UTF-8''<percent-encoded originalName>`
   on every response (streamed or ranged). `inline` (not `attachment`) — this changes
   only the filename a save/download proposes, not whether an `<img>`/`<audio>`/`<video>`
   tag still renders it directly, which is unaffected. The ASCII `filename` is a
   sanitized fallback (non-printable-ASCII characters replaced with `_`) for clients
   without RFC 5987/8187 support; `filename*` always carries the exact, potentially
   Unicode `originalName` — never `storedName`/`storageKey`, which stay internal per
   the existing rule.
2. `generateStorageName(departmentId, extension)` — the one function that produces a
   File's `storedName`/`storageKey` — now lives in `@/server/media/probe.ts` (not
   `features/files/domain/file-types.ts`, which is also imported by the Client Component
   `file-picker.tsx` and must stay free of `node:crypto`/other server-only imports).
   Both `upload-file.ts` and `create-job-artifact.ts` call it instead of each inlining
   the same two lines.

**Consequences.**

- A file downloaded directly from `/api/files/{fileId}` (by a human, in a browser) now
  saves with its real, original extension — matching what ADR-0044 already guaranteed
  for the Worker's own downloads, closing the equivalent gap on the human-facing side.
- No URL shape changed, no new field on `File`, no migration — this is a response-header
  addition only.
- `generateStorageName` has one call site's worth of tests (`probe.test.ts`) instead of
  two near-duplicate blocks; both use cases behave identically to before.

**Status:** DECIDED.
