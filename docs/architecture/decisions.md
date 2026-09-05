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
