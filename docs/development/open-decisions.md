# OPEN DECISION Register

Every design question intentionally left unresolved in Phase 0. **Do not invent an
answer.** When one blocks implementation, raise it with the product owner. Each entry
lists the options and the consequence of each so whoever decides has what they need.

Status: all **OPEN** unless noted. ID format `OD-nn`.

---

## Domain / business rules

### OD-01 — Upload cap model — partially resolved, Phase 6 (ADR-0030)

_Where:_ [../domain/jobs.md](../domain/jobs.md), [../integrations/youtube.md](../integrations/youtube.md).
Legacy: hard-coded **global** cap of **3 per UTC day**, all users.

**Resolved, Phase 6:** kept **global**, UTC-day, count-based, exactly as legacy —
`JOB_UPLOAD_DAILY_CAP` (default 3, configurable via env), reject at creation with a clear
`conflict` error. **Still open:** whether a future per-YouTube-target scope should replace
the global cap once a `YouTubeTarget` model exists — no such model exists yet to scope
against, so this half of the original question is deferred, not answered either way.

### OD-02 — Retry eligibility window — ✅ RESOLVED (ADR-0029)

_Where:_ [../domain/jobs.md](../domain/jobs.md).
Legacy: 3 days from creation; allowed from almost any non-terminal state.

**Resolved, Phase 6:** retry eligible only from `ERROR` and `CANCELED` — narrower than
legacy, which allowed retrying a Job that hadn't actually stopped yet (a design smell, not
a rule worth preserving). Window: `JOB_RETRY_WINDOW_DAYS`, default **3 days** (matches
legacy), configurable via env.

### OD-03 — "Own resource" vs "department resource" scope for USER — resolved for Jobs, Phase 6

_Where:_ [../domain/authorization.md](../domain/authorization.md).
For cancel / retry / delete-own-file, is a plain USER limited to resources they created
or any in their department?

**Phase 3 note:** the `job:manage`/`file:manage` capabilities are registered with a `USER`
role floor (that much is decided) — this OD is only about the finer "own vs. department"
granularity a future Jobs/Files use case still has to add on top.

- _Own only:_ least privilege; awkward when a colleague is away.
- _Whole department:_ collaborative; matches MANAGER; simpler.
  **Recommendation:** whole department for view; confirm for cancel/retry; MANAGER+ for
  destructive file ops.

**Resolved for Jobs, Phase 6:** whole department — a USER may view, create, cancel, and
retry **any** Job in their own Department, not only ones they created. Matches the
already-collaborative model MANAGER/Templates use, and matches the Phase 6 brief's own
"USER: Can operate on Jobs belonging to their Department" (no "own only" qualifier). The
Files half of this OD (destructive file ops = MANAGER+, own-upload = USER) remains
resolved as it already was (ADR-0025) and is unaffected by this.

### OD-04 — Can a USER author/edit Templates?

_Where:_ [../domain/authorization.md](../domain/authorization.md), [../domain/templates.md](../domain/templates.md).

**Phase 3 note:** `template:manage` is registered with a `MANAGER` role floor (the
recommendation's conservative reading) purely so the capability exists; no Template
feature or use case exists yet to actually enforce it.

- _USER can author:_ faster for small teams; a bad template affects the whole department.
- _MANAGER+ only:_ safer, clearer ownership; matches the brief's "MANAGER manages
  templates".
  **Recommendation (leaning):** USER consumes, MANAGER authors — confirm.

**Phase 5 note:** the Phase 5 brief's own draft authorization matrix listed USER as able
to create/edit/enable-disable/soft-delete Templates, which would have resolved this OD the
other way — but that directly contradicted this page's existing, carefully-reasoned
default and every other authorization doc, so it was raised with the product owner rather
than silently implemented either way. **Confirmed: MANAGER+ only** — Phase 5 implements
`template:manage` exactly as the Phase 3 default already had it (USER gets `template:view`
only: view/list own-department Templates, nothing else). This OD is not formally closed by
an ADR (no product-level sign-off beyond this confirmation), but Phase 5's Template feature
is built on this answer.

### OD-05 — Can a MANAGER create/promote another MANAGER?

_Where:_ [../domain/users.md](../domain/users.md).

- _Yes:_ full delegation; privilege sprawl risk.
- _No:_ only ADMIN mints managers; tighter, more admin load.

**Current implemented default (ADR-0023):** no — a MANAGER may only create a `USER` and
may not change anyone's role at all (ADMIN-only). Conservative, not a resolution; revisit
when decided.

### OD-47 — "Last remaining ADMIN" lockout safeguard for bulk/other operations

_Where:_ [../domain/users.md](../domain/users.md), [../domain/authorization.md](../domain/authorization.md), ADR-0023.
Self-service role/status changes are already structurally forbidden for everyone,
including ADMIN (ADR-0023) — that closes the single-user self-lockout path. Whether a
_different_ actor (another ADMIN) disabling/demoting the last remaining ADMIN needs an
explicit count-based safeguard, and whether a future bulk operation needs the same check,
is undecided. No such operation exists yet.

- _Add a "last active ADMIN" count check:_ safer against a rare but catastrophic mistake;
  adds a query + edge case to every path that could disable/demote an ADMIN.
- _No safeguard beyond the self-service block:_ simpler; relies on operational discipline
  (e.g. always keep ≥ 2 ADMINs) instead of code.

### OD-06 — Ambiguous / no phone match on Telegram link

_Where:_ [../domain/users.md](../domain/users.md), [../integrations/telegram.md](../integrations/telegram.md).
Options: reject with a generic message (legacy); admin links manually; invite/claim token
flow.

### OD-07 — Department deletion policy

_Where:_ [../domain/departments.md](../domain/departments.md).
Jobs are never deleted, so a Department with history can't be cleanly removed.

- _Soft-deactivate (`ARCHIVED`) only:_ safe, no data loss, history stays queryable by
  ADMIN. **Recommended.**
- _Hard delete with reassignment:_ needs cross-department move; high complexity.
- _Hard delete with cascade:_ violates ADR-0005/0007 — not acceptable.

### OD-08 — Cross-department resource move / reassignment

_Where:_ [../domain/departments.md](../domain/departments.md).

- _Not supported:_ simplest, no historical ambiguity.
- _ADMIN can reassign:_ useful for reorgs; complicates historical reporting; would need
  auditing and arguably snapshotting the department on the Job.

### OD-09 — Template `name` uniqueness scope — ✅ RESOLVED (ADR-0027)

_Where:_ [../domain/templates.md](../domain/templates.md).
**Resolved, Phase 5:** unique per Department among non-deleted rows, enforced by a
hand-added partial unique index (`WHERE "deletedAt" IS NULL`) — see ADR-0027.

### OD-10 — Zero-asset templates allowed? — ✅ RESOLVED (ADR-0027)

_Where:_ [../domain/templates.md](../domain/templates.md).
**Resolved, Phase 5: allowed.** No minimum-asset-count validation — a Template with no
slots (e.g. a fully static render) is valid.

### OD-11 — Template-level asset defaults — ✅ RESOLVED (ADR-0027)

_Where:_ [../domain/files.md](../domain/files.md), [../domain/templates.md](../domain/templates.md).
**Resolved, Phase 5: yes.** `TemplateAsset.defaultFileId` — optional, only for
`IMAGE`/`AUDIO`/`VIDEO` slots, department-verified against the Template's own department
on every write, and protected from File deletion by `assertNoActiveTemplateDependencies`.
See ADR-0027 for the full contract, including how this composes with ADR-0025's File
deletion-safety design.

### OD-12 — Album grouping entity

_Where:_ [../integrations/telegram.md](../integrations/telegram.md), [../architecture/data-flow.md](../architecture/data-flow.md).
The Telegram "Album" flow creates N Jobs. Do they share an `albumGroupId` / a parent
`AlbumJob` entity, or are they just independent Jobs?

- _Grouping entity:_ nicer UI (see an album as a unit), progress rollup.
- _Independent:_ less schema; matches legacy (which just made N jobs).

### OD-13 — Delivery-only retry

_Where:_ [../integrations/youtube.md](../integrations/youtube.md).
If YouTube/Telegram delivery fails but the render output exists, is there a "retry
delivery only" action, or is the only path retry = new Job (re-render)?

- _Delivery-only retry:_ avoids a wasteful re-render.
- _Only re-render retry:_ one code path; but re-renders unnecessarily.

### OD-14 — Aspect-ratio tolerance value

_Where:_ [../domain/templates.md](../domain/templates.md).
Exact epsilon for "close enough" (e.g. ±1%, ±2%).

### OD-15 — `deliverToTelegram` default

_Where:_ [../domain/jobs.md](../domain/jobs.md).
Default on (DM the creator the file if they're linked) or opt-in?

---

## Data / lifecycle

### OD-16 — Job snapshot storage form — ✅ RESOLVED (ADR-0028)

_Where:_ [../data/historical-integrity.md](../data/historical-integrity.md), [../data/database.md](../data/database.md).

**Resolved, Phase 6:** a `JSONB` `Job.snapshot` column holds the Template-level half
(render fields + ordered asset-slot definitions, as they were); a handful of
denormalized, indexed top-level columns (`title`, `templateId`, `state`, `createdAt`, ...)
cover filtering/sorting. The _resolved asset values_ are **not** part of this JSONB blob
— see OD-22.

### OD-17 — Copy media bytes into the snapshot for critical inputs?

_Where:_ [../data/historical-integrity.md](../data/historical-integrity.md).

- _Copy bytes:_ true immutability, re-render always possible; storage multiplies,
  undermines File hard-deletion savings.
- _Metadata only:_ cheap; old Jobs show "media no longer stored", can't re-render.
  **Recommendation:** metadata only by default; optional per-Job "archive/pin bytes".

### OD-18 — Job Artifact retention specifics

_Where:_ [../data/lifecycle-rules.md](../data/lifecycle-rules.md), [../domain/files.md](../domain/files.md).
When exactly is the rendered video purged (immediately on `UPLOADED` / after N days /
after successful delivery + grace)? Keep screenshot+thumbnail longer? Grace period for
`ERROR`/`CANCELED` jobs' artifacts?
**Recommendation:** purge video after successful required delivery + 7-day grace; keep
screenshot + thumbnail 90 days; all configurable.

### OD-19 — One-off Telegram/upload inputs: artifact or promotable?

_Where:_ [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
**Recommendation:** default `JOB_ARTIFACT`, explicit "save to gallery" action. Still open
— no Job/Telegram feature exists yet to make this choice concrete.

### OD-20 — File dedup mechanism & scope

_Where:_ [../domain/files.md](../domain/files.md).
Content-hash hard dedup (return existing) vs advisory ("similar file exists") vs none.
**Recommendation:** content-hash advisory + opt-in reuse; hard dedup later.

**Phase 4 status:** the groundwork is implemented — `contentHash` is computed and stored
on every upload, and an in-department match surfaces as a non-blocking notice. Still
open: no "reuse this file instead" UI, no merge/hard-dedup path.

### OD-21 — Allowed file types & size limits — ✅ RESOLVED (ADR-0026)

Kept legacy's exact allow-list (`jpg/jpeg/png/webp/mp3/mp4`), validated against sniffed
content, not client-declared. New per-kind size limits legacy never had: 25MB image /
100MB audio / 500MB video. See ADR-0026 and
[../architecture/files.md](../architecture/files.md).

### OD-22 — Assets & outcomes: child rows vs JSONB — Job-asset half ✅ RESOLVED (ADR-0028)

_Where:_ [../data/database.md](../data/database.md).
Template asset slots / resolved Job assets / delivery outcomes — tables or JSON?

**Resolved:** Template asset slots = child rows (Phase 5, ADR-0027). **Resolved, Phase
6:** resolved Job assets = child rows too (`JobAsset`) — not JSONB, per the Phase 6
brief's explicit relational-model requirement; each row carries its own copied File
metadata for historical integrity (ADR-0028). **Still open:** delivery outcomes — no
delivery mechanism exists yet.

### OD-23 — Audit entry retention

_Where:_ [../security/security.md](../security/security.md).
Kept forever, or a retention window (e.g. 2 years)?

### OD-24 — Legacy Mongo data import

_Where:_ [../data/database.md](../data/database.md).
Import historical templates/jobs/files, or start clean and keep legacy read-only?
**Recommendation:** out of scope unless a requirement says otherwise.

### OD-25 — Job storage growth at scale (archival/partitioning)

_Where:_ [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
Jobs are never deleted. Time-based partitioning / cold storage strategy — later concern,
must preserve full readability, never a deletion.

### OD-26 — Cancelled job: zero out progress/duration for display? — ✅ RESOLVED (ADR-0029)

_Where:_ [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).
Legacy reset them to 0. Historical integrity favors keeping the values.

**Resolved, Phase 6:** kept, never zeroed. `cancelJob` writes only `state`,
`canceledByUserId`, `canceledAt`, `cancelReason` — `progress`/`durationSeconds`/every
timeline timestamp are left exactly as they were at the moment of cancellation.

---

## Integrations / infrastructure

### OD-27 — Worker authentication mechanism — ✅ RESOLVED (ADR-0032)

_Where:_ [../integrations/worker-api.md](../integrations/worker-api.md), ADR-0004.

**Resolved, Phase 7:** a single shared static API key (`WORKER_API_KEY`, required env
var), sent as `Authorization: Bearer <key>`, compared with a timing-safe check. No
`WorkerCredential` table, no per-Worker identity, no rotation-without-redeploy — a
deliberate simplification (the original recommendation's "hashed at rest" language
assumed a database table this phase decided not to build). Revisit HMAC/mTLS/per-Worker
identity only if a concrete requirement calls for it.

### OD-28 — Worker API versioning scheme — ✅ RESOLVED (ADR-0033)

_Where:_ [../architecture/boundaries.md](../architecture/boundaries.md), [../integrations/worker-api.md](../integrations/worker-api.md).

**Resolved, Phase 7:** path prefix, `/api/worker/v1/...` — matches what
`docs/architecture/rest-architecture.md`'s own illustration and this page already
assumed ahead of implementation.

### OD-29 — Worker claim endpoint: keep `GET`/`404` compatibility? — partially resolved, Phase 7

_Where:_ [../integrations/worker-api.md](../integrations/worker-api.md), [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).

**Resolved (Studio's own behavior):** `POST /api/worker/v1/jobs/next` + `204` when empty
— no `GET` alias, no `404`-for-empty compatibility shim (ADR-0033). **Still open:**
whether the actual, currently-deployed Worker can tolerate this without its own update —
unconfirmed, since the real Worker's source is outside this repo.

### OD-30 — Worker may read only its claimed jobs? — ✅ RESOLVED (ADR-0034)

_Where:_ [../integrations/worker-api.md](../integrations/worker-api.md).

**Resolved, Phase 7:** no restriction — `GET /api/worker/v1/jobs/:id` returns any Job by
id, claimed or not. Studio's Worker is one shared, non-departmental principal with no
per-Worker identity (ADR-0032), so a per-claim restriction would be a restriction Studio
cannot actually enforce; the docs say so honestly rather than implying one exists.

### OD-31 — Worker timeout / stuck-job recovery

_Where:_ [../domain/jobs.md](../domain/jobs.md), [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
A job stuck in `CLAIMED`/`RENDERING` past a timeout → requeue to `QUEUED` or fail to
`ERROR`? Timeout length?

### OD-32 — Internal state substates from the Worker

_Where:_ [../domain/jobs.md](../domain/jobs.md).
Keep `RENDERING` as one internal state, or track downloading/started/in-progress
substates for UI detail. (The Worker API accepts legacy ints regardless.)

### OD-33 — Duration field name on the Worker API — ✅ RESOLVED (Phase 7)

_Where:_ [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).

**Resolved:** renamed to `{ durationSeconds }` — `PATCH /api/worker/v1/jobs/:id/duration`
does not accept the legacy `duration` key. A real Worker integration needs its own
matching update; this was not kept as a dual-key compatibility shim.

### OD-34 — Telegram: webhook vs long-polling

_Where:_ [../integrations/telegram.md](../integrations/telegram.md).
**Recommendation:** webhook (fits the single-deployable model), with Telegram's secret
token verified per request.

### OD-35 — Telegram wizard TTL length

_Where:_ [../data/lifecycle-rules.md](../data/lifecycle-rules.md), [../integrations/telegram.md](../integrations/telegram.md).
e.g. 1 hour vs 24 hours.

### OD-36 — YouTubeTarget scoping

_Where:_ [../integrations/youtube.md](../integrations/youtube.md).
Department-scoped vs global (ADMIN-managed).
**Recommendation:** department-scoped, ADMIN may also manage all.

### OD-37 — YouTube video privacy / metadata configurability

_Where:_ [../integrations/youtube.md](../integrations/youtube.md).
Keep hard-coded `private`, or expose privacy/scheduling/category per Template or Job.
**Recommendation:** default `private`, allow `unlisted`/`public` at Template level; defer
scheduling.

### OD-38 — Media processing location

_Where:_ [../architecture/tech-stack.md](../architecture/tech-stack.md).
Screenshot/thumbnail generation (and any input normalization) in-process, in a queue
worker, or delegated to the Render Worker.

### OD-39 — Is input normalization (legacy ffmpeg/convert) needed at all?

_Where:_ [../domain/files.md](../domain/files.md).
Legacy transcoded on upload; the `convert` step looked like a no-op and its intent is
unknown. Confirm whether Studio needs any on-upload processing.

### OD-40 — Background-work / durable-job mechanism

_Where:_ ADR-0016, [../architecture/data-flow.md](../architecture/data-flow.md), [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
Transactional outbox + poller / a real queue (BullMQ, pg-boss, …) / scheduled tasks.
Needed for: durable delivery, artifact cleanup, wizard TTL sweep, stuck-job recovery.

### OD-41 — Rate-limiting layer

_Where:_ [../security/security.md](../security/security.md).
Edge middleware / a limiter library / infra (reverse proxy, API gateway).

### OD-42 — Object storage backend — interface half ✅ RESOLVED (ADR-0024); backend choice still open

_Where:_ [../architecture/tech-stack.md](../architecture/tech-stack.md),
[../architecture/files.md](../architecture/files.md).

**Resolved:** a `StorageAdapter` interface exists at `@/server/adapters/storage`, with a
local-disk implementation for development/single-instance deployment. **Still open:**
whether/when a production deployment needs an S3-compatible (or other) adapter instead —
the interface makes that a new implementation file, not an architecture change, whenever
it's needed.

### OD-43 — Session / auth library — ✅ RESOLVED (ADR-0020)

Custom, DB-backed opaque-token sessions (httpOnly cookie, SHA-256 hash stored in a
`Session` table) + bcrypt password hashing. No NextAuth/Auth.js, no JWT. See
[../architecture/authentication.md](../architecture/authentication.md) and ADR-0020.

---

## Process / tooling

### OD-44 — Package manager — ✅ RESOLVED (ADR-0018)

**npm** (bundled with Node 20, `npm >= 10`; `package-lock.json` committed; no Corepack,
no `packageManager` field). All scripts and docs use `npm run …`.

### OD-45 — Prisma table/column naming — ✅ RESOLVED (ADR-0021)

Tables `@@map`ped to lowercase snake_case plural (`"users"`, `"sessions"`); columns keep
Prisma's default (camelCase, matching the field name). See ADR-0021.

### OD-46 — Personal-data erasure (GDPR-style)

_Where:_ ADR-0007, [../security/security.md](../security/security.md).
Users are never deleted. If legal erasure is ever required, design deliberate
anonymization (not row deletion).
