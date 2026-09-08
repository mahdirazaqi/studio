# OPEN DECISION Register

Every design question intentionally left unresolved in Phase 0. **Do not invent an
answer.** When one blocks implementation, raise it with the product owner. Each entry
lists the options and the consequence of each so whoever decides has what they need.

Status: all **OPEN** unless noted. ID format `OD-nn`.

---

## Domain / business rules

### OD-01 — Upload cap model — MOOT, Phase 12 (ADR-0041)

_Where:_ [../domain/jobs.md](../domain/jobs.md).
Legacy: hard-coded **global** cap of **3 per UTC day**, all users.

**Resolved, Phase 6:** kept **global**, UTC-day, count-based, exactly as legacy —
`JOB_UPLOAD_DAILY_CAP` (default 3, configurable via env), reject at creation with a clear
`conflict` error. A `YouTubeTarget` model existed briefly (Phase 9, ADR-0039) with no
per-target cap built alongside it. **Closed as moot, Phase 12:** the entire upload-cap
concept (`JOB_UPLOAD_DAILY_CAP`, `Job.deliverToYouTube`) was removed — Studio no longer
uploads rendered Jobs to YouTube, so there is nothing left to cap (ADR-0041).

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

### OD-06 — Ambiguous / no phone match on Telegram link — ✅ RESOLVED (ADR-0036)

_Where:_ [../domain/users.md](../domain/users.md), [../integrations/telegram.md](../integrations/telegram.md).

**Resolved, Phase 8:** ambiguity cannot occur — `User.phone` is `@unique`, so at most one
User can ever match a given phone number. Only "no match" remains possible, handled with
one generic, safe rejection message (legacy's behavior, kept) that never reveals whether a
differently-statused account exists for that number.

### OD-07 — Department deletion policy

_Where:_ [../domain/departments.md](../domain/departments.md).
Jobs are never deleted, so a Department with history can't be cleanly removed.

- _Soft-deactivate (`ARCHIVED`) only:_ safe, no data loss, history stays queryable by
  ADMIN. **Recommended.**
- _Hard delete with reassignment:_ needs cross-department move; high complexity.
- _Hard delete with cascade:_ violates ADR-0005/0007 — not acceptable.

### OD-08 — Cross-department resource move / reassignment — 🟨 PARTIALLY RESOLVED (ADR-0040)

_Where:_ [../domain/departments.md](../domain/departments.md),
[../domain/templates.md](../domain/templates.md).

**Resolved for Templates, Phase 11:** ADMIN may transfer a Template to a different
Department (`updateTemplate`, `requireRole(actor, "ADMIN")` gates the branch) — dependent
File references are re-verified against the target Department (a YouTube-Target
reference was re-verified here too, Phase 11, before that field was removed entirely —
ADR-0041), and no audit/snapshot mechanism was needed because `Job.departmentId` is
already a plain column copied at Job-creation time, never a live join through the
Template (see ADR-0040 and `docs/domain/templates.md` "Department transfer").

**Still open for Job / File / User** — the reasoning that made Templates safe to move
(the resource being moved isn't itself the historical record) does not apply the same
way to a Job, which _is_ the historical record:

- _Not supported (Job/File/User):_ simplest, no historical ambiguity.
- _ADMIN can reassign (Job/File/User):_ useful for reorgs; complicates historical
  reporting (a Job's department could change after the fact — unlike a Template's
  transfer, this would actually be visible on existing history unless the department
  were snapshotted onto the Job the way Template-level fields already are); would need
  auditing and arguably snapshotting.

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

### OD-12 — Album grouping entity — ✅ RESOLVED (ADR-0037)

_Where:_ [../integrations/telegram.md](../integrations/telegram.md), [../architecture/data-flow.md](../architecture/data-flow.md).

**Resolved, Phase 8: independent Jobs, no grouping entity.** Matches legacy (which just
made N jobs) and avoids speculative schema for a "view an album as a unit" UI nobody has
asked for yet. Album's N Jobs are traceable as a batch only by having been created via the
same confirmation (same template, close timestamps), not by a schema relationship.

### OD-13 — Delivery-only retry — MOOT, Phase 12 (ADR-0041)

_Where:_ [../domain/jobs.md](../domain/jobs.md).

**Resolved, Phase 9: delivery-only retry, not re-render.** `retryJobDelivery`
(`features/delivery/use-cases/retry-job-delivery.ts`) reused the already-rendered
`videoFileId`/`screenshotFileId` and re-ran only the YouTube upload — the Job was never
re-created and never re-rendered. **Removed, Phase 12:** there is no delivery left to
retry — `retryJobDelivery` and its Server Action/route were deleted along with the rest
of YouTube delivery (ADR-0041). Job Retry (`retryJob`, unrelated) is unaffected.

### OD-14 — Aspect-ratio tolerance value

_Where:_ [../domain/templates.md](../domain/templates.md).
Exact epsilon for "close enough" (e.g. ±1%, ±2%).

### OD-15 — `deliverToTelegram` default — ✅ RESOLVED, Phase 9 (ADR-0039)

_Where:_ [../domain/jobs.md](../domain/jobs.md).

**Resolved, Phase 9: no flag at all — automatic, best-effort, matches legacy exactly.**
`Job` still has no `deliverToTelegram` column: a linked creator is notified on
`RENDERED`/`UPLOADED`/`ERROR` unconditionally (`deliver-job-result.ts`), with no per-Job
opt-out, exactly like legacy's unconditional `sendTelegramMessage` calls. A failure to
notify never blocks or fails the Job — it is a notification, not a delivery. Adding an
opt-out is a real, undecided product question (not addressed by this resolution) — revisit
if a requirement calls for one.

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

### OD-18 — Job Artifact retention specifics — cleanup primitive ✅ built, Phase 9; trigger/grace period still open

_Where:_ [../data/lifecycle-rules.md](../data/lifecycle-rules.md), [../domain/files.md](../domain/files.md).
When exactly is the rendered video purged (immediately on `RENDERED` / after N days /
after a grace period)? Keep screenshot+thumbnail longer? Grace period for
`ERROR`/`CANCELED` jobs' artifacts?
**Recommendation:** purge video 7 days after reaching `RENDERED`; keep screenshot +
thumbnail 90 days; all configurable.

**Phase 9 status, revised Phase 12 (ADR-0041):** the safe, idempotent, reference-aware
primitive still exists (`features/delivery/use-cases/cleanup-job-artifacts.ts`,
ADR-0039) — it deletes only the video (never screenshot/thumbnail), only from
`RENDERED` (its "required YouTube delivery must have succeeded" guard was removed along
with `YouTubeTarget`, since `RENDERED` is now itself the terminal state). **Not
auto-triggered** — no grace period, no scheduler. This OD stays open for exactly that:
when/how something calls this function (OD-40's durable-work mechanism is the natural
trigger once it exists).

### OD-19 — One-off Telegram/upload inputs: artifact or promotable? — Telegram's input side ✅ RESOLVED (ADR-0038)

_Where:_ [../data/lifecycle-rules.md](../data/lifecycle-rules.md).

**Resolved for Telegram, Phase 8:** a Telegram-collected file is uploaded through the
unmodified `features/files/use-cases/upload-file.ts` and becomes an ordinary
`GALLERY_ASSET` immediately — not a distinct temporary/`JOB_ARTIFACT` category with its
own promote step. There is no separate "temporary" state to promote _from_, so this
phase's original recommendation (default `JOB_ARTIFACT`, explicit promote) does not apply
once Telegram is the entry point. **Still open:** the general "does a Job's _output_ need a
`JOB_ARTIFACT`-like temporary category" question — unaffected, no result-upload endpoint
exists yet (see [../integrations/worker-api.md](../integrations/worker-api.md) §6).

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

### OD-27 — Worker authentication mechanism — ✅ RESOLVED (ADR-0040, supersedes ADR-0032)

_Where:_ [../integrations/worker-api.md](../integrations/worker-api.md), ADR-0004.

**Resolved, Phase 7 (ADR-0032):** a single shared static API key (`WORKER_API_KEY`,
required env var), sent as `Authorization: Bearer <key>`, compared with a timing-safe
check. No `WorkerCredential` table, no per-Worker identity, no rotation-without-redeploy.

**Superseded, Phase 11 (ADR-0040):** a real `WorkerCredential`-equivalent now exists —
`WorkerApiKey` (hashed secret, `ACTIVE`/`REVOKED` status, many-to-many Department scope,
ADMIN-managed CRUD at `/worker-keys`). `WORKER_API_KEY` is removed entirely, no
fallback. This is exactly the concrete requirement OD-27's original resolution said
would justify revisiting: multiple Workers, each independently revocable and scoped to
its own Department set.

### OD-28 — Worker API versioning scheme — ✅ RESOLVED (ADR-0033)

_Where:_ [../architecture/boundaries.md](../architecture/boundaries.md), [../integrations/worker-api.md](../integrations/worker-api.md).

**Resolved, Phase 7:** path prefix, `/api/v1/worker/...` — matches what
`docs/architecture/rest-architecture.md`'s own illustration and this page already
assumed ahead of implementation.

### OD-29 — Worker claim endpoint: keep `GET`/`404` compatibility? — partially resolved, Phase 7

_Where:_ [../integrations/worker-api.md](../integrations/worker-api.md), [../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).

**Resolved (Studio's own behavior):** `POST /api/v1/worker/jobs/next` + `204` when empty
— no `GET` alias, no `404`-for-empty compatibility shim (ADR-0033). **Still open:**
whether the actual, currently-deployed Worker can tolerate this without its own update —
unconfirmed, since the real Worker's source is outside this repo.

### OD-30 — Worker may read only its claimed jobs? — ✅ RESOLVED (ADR-0034)

_Where:_ [../integrations/worker-api.md](../integrations/worker-api.md).

**Resolved, Phase 7:** no restriction — `GET /api/v1/worker/jobs/:id` returns any Job by
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

**Resolved:** renamed to `{ durationSeconds }` — `PATCH /api/v1/worker/jobs/:id/duration`
does not accept the legacy `duration` key. A real Worker integration needs its own
matching update; this was not kept as a dual-key compatibility shim.

### OD-34 — Telegram: webhook vs long-polling — ✅ RESOLVED (ADR-0035)

_Where:_ [../integrations/telegram.md](../integrations/telegram.md).

**Resolved, Phase 8: webhook.** `POST /api/telegram/webhook`, authenticated by Telegram's
own `X-Telegram-Bot-Api-Secret-Token` header mechanism. Fits the single-deployable model;
no second process, no polling-consumer coordination.

### OD-35 — Telegram wizard TTL length — ✅ RESOLVED (ADR-0037)

_Where:_ [../data/lifecycle-rules.md](../data/lifecycle-rules.md), [../integrations/telegram.md](../integrations/telegram.md).

**Resolved, Phase 8: 60 minutes**, configurable via `TELEGRAM_WIZARD_TTL_MINUTES`.
Expiration is checked lazily on next read, not by a scheduled sweep (OD-40's durable-work
mechanism doesn't exist yet).

### OD-36 — YouTubeTarget scoping — MOOT, Phase 12 (ADR-0041)

_Where:_ [../domain/departments.md](../domain/departments.md).

**Resolved, Phase 9: department-scoped**, exactly per this OD's own recommendation.
`YouTubeTarget.departmentId` was required; `youtube:manage` was `MANAGER+` within their
own department, ADMIN may connect/manage a Target for any department. **Also resolved
alongside this:** the connection mechanism itself was a verified refresh-token entry,
not a self-service OAuth consent-screen flow (ADR-0039 point 5).

**Revised, Phase 11 (ADR-0040):** a single FK undersold how channels are actually
shared — `YouTubeTarget.departmentId` became `departments`, a many-to-many with
`Department`, and `youtube:manage` moved to ADMIN-only.

**Closed as moot, Phase 12:** `YouTubeTarget` and `youtube:manage` were removed
entirely — Studio no longer uploads to YouTube (ADR-0041).

### OD-37 — YouTube video privacy / metadata configurability — MOOT, Phase 12 (ADR-0041)

_Where:_ [../domain/jobs.md](../domain/jobs.md).
Keep hard-coded `private`, or expose privacy/scheduling/category per Template or Job.
**Recommendation:** default `private`, allow `unlisted`/`public` at Template level; defer
scheduling.

**Phase 9 status:** still open, unresolved as recommended — `uploadVideo` hard-coded
`privacyStatus: 'private'` and `madeForKids: false`, matching legacy exactly, no
per-Template/per-Job override was built. **Closed as moot, Phase 12:** the entire
YouTube upload feature was removed (ADR-0041) — there is no video privacy left to
configure.

### OD-38 — Media processing location — ✅ RESOLVED, Phase 9 (ADR-0039)

_Where:_ [../architecture/tech-stack.md](../architecture/tech-stack.md).

**Resolved, Phase 9: in-process, synchronously, inside the Worker's own
`POST .../result` request** (`features/delivery/use-cases/generate-render-artifacts.ts`,
`server/adapters/media/ffmpeg-adapter.ts`) — not a queue worker, not delegated to the
Render Worker. Matches the "no background-work mechanism exists yet" constraint (OD-40)
and keeps the Worker's own request the single synchronous pipeline from "result received"
through "delivery attempted." Revisit if render-result volume ever makes this request's
latency (media processing + a full YouTube upload) a real operational problem.

### OD-39 — Is input normalization (legacy ffmpeg/convert) needed at all?

_Where:_ [../domain/files.md](../domain/files.md).
Legacy transcoded on upload; the `convert` step looked like a no-op and its intent is
unknown. Confirm whether Studio needs any on-upload processing.

### OD-40 — Background-work / durable-job mechanism — Telegram Job-lifecycle notifications ✅ resolved, Phase 9; the general mechanism still open

_Where:_ ADR-0016, [../architecture/data-flow.md](../architecture/data-flow.md), [../data/lifecycle-rules.md](../data/lifecycle-rules.md).
Transactional outbox + poller / a real queue (BullMQ, pg-boss, …) / scheduled tasks.
Needed for: durable delivery, artifact cleanup, wizard TTL sweep, stuck-job recovery, and
(Phase 8) Telegram Job-lifecycle notifications (DM the creator on `RENDERED`/`UPLOADED`/
`ERROR`) — not implemented in Phase 8 for exactly this reason: nothing yet drove a Job
into those states in the first place (no real Worker/render pipeline was running), so
there was no live trigger point to notify from.

**Resolved for Telegram notifications, Phase 9 (ADR-0039), revised Phase 12 (ADR-0041):**
the trigger point now exists — `accept-job-result.ts` calls `sendJobNotification` on
`RENDERED` (the Job's final, successful state), synchronously, best-effort, no queue
involved (a failed DM is logged, never retried, never blocks the Job — matches legacy
exactly). This resolves the "no trigger point" half of this OD for Telegram
specifically; it does **not** resolve the general background-work-mechanism question.
(Phase 9's YouTube-delivery durability guarantee, `DeliveryAttempt`'s `PENDING`-before-
the-call write pattern, no longer applies — that whole pipeline was removed, ADR-0041.)
doesn't require. **Still open, unaffected:** artifact cleanup scheduling (OD-18), Telegram
wizard TTL sweep, stuck-job recovery (OD-31) — none of these have Phase 9's "the
triggering event already happens inside an existing request" property, so they still need
an actual scheduler/mechanism whenever they're built.

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
