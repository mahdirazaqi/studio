# Domain: Jobs

**Implemented, Phase 6.** This page is the business rules;
[../architecture/decisions.md](../architecture/decisions.md) ADR-0028/0029/0030/0031
records the decisions behind the shape below, and
[`prisma/schema.prisma`](../../prisma/schema.prisma) is the final schema. **Not
implemented this phase:** the Worker REST API (Phase 7), Telegram, YouTube delivery,
rendering itself — this page's "Worker claim"/"Completion & delivery" sections describe
the **application services** Phase 6 built for those to call, not a working end-to-end
pipeline yet.

## Purpose

A **Job** is one concrete render request: a Template with every asset slot filled,
tracked through a state machine from creation to delivery. **A Job is the permanent
historical record of the pipeline.**

---

## Part A — Legacy behavior (reference only) `LEGACY`

From `qtical-backend-node/src/render/job` (see
[../legacy/render-module-analysis.md](../legacy/render-module-analysis.md) §3.2, §7, §18).

- Mongo collection `jobs`. GraphQL (`addJob`, `getJob`, `getJobs`, `getUploadJobLimit`,
  `retryJob`, `cancelJob`) + unauthenticated REST for the worker.
- `title` auto-built by joining all `data`-type asset values with `" | "`.
- `state`: integer enum `Queued(0) Fetched(1) Downloading(2) Started(3) InProgress(4)
Rendered(5) Uploading(6) Uploaded(7) Error(8) Cancel(9)`. `Downloading`/`Started`/
  `Uploading` were **never set by the backend** — only (presumably) by the worker;
  `changeStateJob` accepted **any integer** with no validation.
- On `Rendered`: `renderedAt` set, Telegram DM + in-app system message. On `Uploaded`:
  `uploadedAt` set, Telegram DM only. On `Error`: Telegram DM only (reason logged
  server-side only).
- `addJob`: if `upload:true`, checks a **global** daily cap of 3 upload-jobs across the
  entire system; loads template (does **not** check `disabled`); for each template asset,
  requires a value in `input.assets`; `data` → literal text, else → `File.findById`
  (path copied by value into the job asset). Creates job `state=Queued`,
  `workDir=template.output`.
- `fetch` (`GET /jobs/fetch`): `findOne({state:Queued})` then later `save({state:Fetched})`
  — **not atomic** (race).
- `retryJob`: **`findOneAndDelete`** the original (must be non-terminal, < 3 days old),
  then check upload cap, then `create` a new `Queued` job carrying `_createdBy`,
  `_template`, `title`, `workDir`, `assets`, `upload`, `retriedCount+1`, `_retriedBy`.
  **Destructive**, and the cap check happens _after_ the delete → possible total loss.
  No activity-log entry emitted.
- `cancelJob(ids[])`: bulk; skips jobs already in `Rendered/Uploading/Uploaded/Cancel`;
  sets `state=Cancel`, resets `duration`/`progress`, sets `canceledAt`.
- `uploadJobFile`: saves video to disk, ffmpeg screenshot at `00:00:04.000`, ImageMagick
  thumbnail resize `x150`, then **fire-and-forget** (unawaited) YouTube + Telegram
  delivery; returns 200 immediately.
- **No department/ownership scoping.** **No test coverage.**

---

## Part B — Studio design (implemented)

### Core rules

1. **A Job is never deleted** — no hard delete, no soft delete (ADR-0005). No
   `deleteJob`/`editJob` exists; every mutation is one of the explicit lifecycle
   operations below.
2. **A Job carries an immutable historical snapshot**, split across two places
   (ADR-0028): `Job.snapshot` (JSONB — the Template-level render fields and ordered
   asset-slot definitions, as they were) and `JobAsset` rows (the resolved per-slot
   values, each with its own copied File metadata). Both are written once, in the
   creation transaction, and never updated afterward.
3. **State transitions are explicit and validated** (ADR-0013, ADR-0029) — every write
   to `Job.state` is a single atomic conditional `UPDATE`, never a read-then-write.
4. **Job claiming by the Worker is atomic** — `SELECT ... FOR UPDATE SKIP LOCKED`, one
   raw SQL statement. Manually verified: two concurrent claims never return the same Job.
5. **Retry never destroys the original** — it creates a new linked Job, copying the
   original's snapshot and assets verbatim (ADR-0031).
6. **Every Job belongs to a Department**, resolved from its Template — never a separate,
   client-supplied field — and is authorized accordingly.

**Not yet built:** delivery (`DELIVERING`/`UPLOADED` are real, reachable states, but no
adapter drives a Job into `DELIVERING` yet — see "Completion & delivery" below).

### State machine

Implemented in `features/jobs/domain/job-state-machine.ts`. Legacy mapping in
[../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).

| State        | Meaning                                                                       | Set by                              |
| ------------ | ----------------------------------------------------------------------------- | ----------------------------------- |
| `QUEUED`     | Created, waiting for a Worker.                                                | `createJob` / `retryJob`            |
| `CLAIMED`    | An atomic claim assigned it to a Worker.                                      | `claimNextJob`                      |
| `RENDERING`  | Worker is actively rendering (covers legacy Downloading/Started/InProgress).  | Worker (via `transitionJob`)        |
| `RENDERED`   | Render finished; result file uploaded/attached.                               | Worker (via `transitionJob`)        |
| `DELIVERING` | Post-render delivery (YouTube/Telegram) in progress.                          | Studio (future delivery module)     |
| `UPLOADED`   | All required delivery succeeded (or none was needed). **Terminal (success).** | Worker/Studio (via `transitionJob`) |
| `ERROR`      | Render or delivery failed; carries `errorReason`.                             | Worker/Studio (via `transitionJob`) |
| `CANCELED`   | Canceled by an operator. **Terminal.**                                        | `cancelJob`                         |

Allowed transitions (implemented, `job-state-machine.ts`):

```
QUEUED    → CLAIMED, CANCELED
CLAIMED   → RENDERING, QUEUED (requeue on worker timeout — not yet swept), ERROR, CANCELED
RENDERING → RENDERED, ERROR, CANCELED
RENDERED  → DELIVERING, UPLOADED (no delivery needed), ERROR
DELIVERING→ UPLOADED, ERROR
ERROR, UPLOADED, CANCELED → (terminal — no outgoing transitions)
```

- Any transition not in the map is **rejected** — `transitionJob` checks it before
  attempting the write, and the write itself (`transitionJobRow`'s conditional `UPDATE
... WHERE state IN (fromStates)`) is the actual, race-proof enforcement.
- `CANCELED` is reachable only from `QUEUED`/`CLAIMED`/`RENDERING` (`CANCELABLE_STATES`)
  — mirrors legacy intent, enforced by the state machine rather than a hand-rolled query.
- **`CLAIMED`/`RENDERING` requeue-on-timeout is not implemented.** The `CLAIMED →
QUEUED` edge exists in the graph for it, but no sweep exists yet — OD-31 (Worker
  timeout / stuck-job recovery) stays open.
- Progress/duration updates are rejected once a Job reaches **any** terminal state
  (`isTerminalState`) — a small, deliberate widening of legacy's "only blocked by
  Cancel."

> **`OPEN DECISION` — Worker fine-grained substates.** The Worker sends legacy numeric
> states (2/3/4 for Downloading/Started/InProgress); Phase 7's Worker API must map all
> three onto `RENDERING` (this phase's canonical state set has no substates). Unaffected
> by Phase 6.

### Fields (implemented; final schema in [`prisma/schema.prisma`](../../prisma/schema.prisma))

| Field                                                               | Notes                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                | Permanent.                                                                                                                                                                               |
| `departmentId`                                                      | Required. **Derived from the chosen Template's department** — never a separate, client-supplied field (Phase 6 brief §4).                                                                |
| `createdByUserId`                                                   | Permanent reference. On a retry, this stays the **original creator** (legacy behavior, kept) — see `retriedByUserId`.                                                                    |
| `templateId`                                                        | FK to the Template (kept resolvable forever — Template is soft-deleted only). Convenience/active-dependency only — never the source of truth for a historical Job's meaning.             |
| `snapshot`                                                          | **Immutable JSONB.** Template render fields + ordered asset-slot definitions at creation. See "Job assets" below for the _resolved values_, which are **not** in this column (ADR-0028). |
| `title`                                                             | Derived from `DATA` asset values at creation, joined `"                                                                                                                                  | "` (legacy rule kept). Stored, never recomputed. |
| `state`                                                             | From the state machine. Written only via `transitionJobRow`'s atomic conditional update.                                                                                                 |
| `progress`                                                          | 0–100, nullable until the Worker's first report. Rejected once the Job is terminal.                                                                                                      |
| `durationSeconds`                                                   | Nullable until reported. Rejected once the Job is terminal.                                                                                                                              |
| `deliverToYouTube`                                                  | Whether to publish to YouTube on completion (legacy `upload`). Part of the Job's immutable configuration — counted by the daily upload quota (ADR-0030) when `true`.                     |
| `retryOfJobId`, `attemptNumber`                                     | Non-destructive retry lineage (ADR-0031). `attemptNumber` is 1 for an original, `original.attemptNumber + 1` for a retry.                                                                |
| `retriedByUserId`, `retryReason`                                    | Who triggered a retry-created Job, and why (optional).                                                                                                                                   |
| `canceledByUserId`, `canceledAt`, `cancelReason`                    | Set once, by `cancelJob`. Never resets `progress`/`durationSeconds` (resolves OD-26).                                                                                                    |
| `errorReason`                                                       | Human-readable failure reason. Surfaced in the UI; never a stack trace.                                                                                                                  |
| `claimedAt`, `startedAt`, `renderedAt`, `deliveredAt`, `uploadedAt` | Timeline — each set once, the first time `transitionJob` reaches the corresponding state. Never reset.                                                                                   |
| `createdAt`, `updatedAt`                                            |                                                                                                                                                                                          |

**Not present, deliberately:** `deliverToTelegram` (no Telegram linking mechanism exists
on `User` yet — the flag would be unusable in practice, not just unused-schema);
`videoFileId`/`screenshotFileId`/`thumbnailFileId`/`deliveryOutcomes` (nothing produces a
`JOB_ARTIFACT` or a delivery outcome yet — Phase 7/YouTube/Telegram's job, not
speculative schema added ahead of a writer for it).

### Job assets

Implemented as relational `JobAsset` rows (ADR-0028, resolves OD-22's Job-asset half) —
**not** JSONB, per the Phase 6 brief's explicit "proper relational Job Asset model"
requirement. One row per Template asset slot the Job filled in, plus one injected
`SCRIPT` row always first (legacy: script is `assets[0]`).

| Field                                                                                    | Notes                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slotKey`                                                                                | Matches a Template asset `key`. `null` for the injected `SCRIPT` row, which has no author-defined slot.                                                                                                                                                   |
| `kind`                                                                                   | `DATA` \| `IMAGE` \| `AUDIO` \| `VIDEO` \| `SCRIPT` (script injected, not author-visible on the Template).                                                                                                                                                |
| `composition`, `layer`                                                                   | Passed through to the Worker. Opaque to Studio. `null` for the `SCRIPT` row (it has no Template slot to copy them from).                                                                                                                                  |
| `textValue`                                                                              | For `DATA` (and the `SCRIPT` row's `scriptRef`, copied verbatim from the Template at creation).                                                                                                                                                           |
| `fileId`, `fileOriginalName`, `fileMimeType`, `fileSizeBytes`, `fileWidth`, `fileHeight` | For file kinds: `fileId` is a live FK (`onDelete: SetNull`) for active-dependency checks; every other column is **copied at creation** and never re-read from the live `File` row — this is what keeps the row meaningful even after the File is deleted. |
| `order`                                                                                  | Matches the Template asset's declared order; the injected `SCRIPT` row is always `0`.                                                                                                                                                                     |

### Creation

Implemented in `features/jobs/use-cases/create-job.ts` +
`features/jobs/use-cases/resolve-job-assets.ts`:

1. Load the Template via `findTemplateInScope` (Templates' own repository, reused
   directly) — department-scoped for USER/MANAGER, all departments for ADMIN. A
   cross-department or nonexistent id resolves to `not_found`, exactly like Templates'
   own detail page.
2. `authorize(actor, "job:manage", { departmentId: template.departmentId })` — the
   Job's Department **is** the Template's Department; there is no separate field to
   check or trust.
3. Reject if the Template is soft-deleted or `status !== "ACTIVE"` — enforced here, the
   only Job-creation path that exists today (no Telegram surface yet to also enforce it
   on).
4. For each Template asset slot, in order, require exactly one matching input value:
   - `DATA` → non-empty literal text; contributes to `title`.
   - file kinds → a `fileId` resolved **server-side**, scoped to the **Template's**
     Department (not necessarily the actor's — the ADMIN case), verified to exist, be a
     `GALLERY_ASSET`, and match the slot's kind. A client-supplied `storageKey`/`path`/
     `mimeType`/`departmentId` is never trusted — only a File `id` is accepted, and the
     server resolves everything else.
   - An unknown slot key, a missing slot, or a kind mismatch all reject with a clear
     `business_rule` error naming the slot.
5. Inject the `SCRIPT` asset from the Template's `scriptRef`.
6. Build the immutable `snapshot` (Template render fields + ordered slot definitions,
   as they were).
7. If `deliverToYouTube`: enforce the upload cap (ADR-0030) **inside the same
   transaction** as the insert.
8. Create the Job `state = QUEUED` with its `JobAsset` rows, atomically.

**Aspect-ratio validation is not implemented.** A Template slot's `imageRatio` is
recorded on the slot definition and copied into the snapshot, but Job creation does not
yet compare an uploaded image's actual dimensions against it — no feature does that yet
(OD-14 stays open, unaffected by this phase).

### Worker claim (atomic)

`claimNextJob()` (`features/jobs/use-cases/claim-next-job.ts`, no `Actor` — see
"Worker identity vs User identity" below) selects the oldest `QUEUED` Job and moves it to
`CLAIMED` in one atomic raw SQL statement: `UPDATE jobs SET state = 'CLAIMED', ... WHERE
id = (SELECT id FROM jobs WHERE state = 'QUEUED' ORDER BY "createdAt" FOR UPDATE SKIP
LOCKED LIMIT 1) RETURNING id`. Two concurrent Workers can never receive the same Job —
manually verified against the real database with two genuinely concurrent calls. Legacy's
non-atomic `fetch` is exactly what this fixes. **Not exposed over REST yet** — Phase 7's
`POST /api/worker/v1/jobs/next` will call this directly, after its own Worker-credential
authentication.

Global, not Department-scoped, FIFO by `createdAt` — matches legacy's single shared
queue. Priority/fairness/capability filtering are not planned (unchanged OPEN DECISION,
[../integrations/worker-api.md](../integrations/worker-api.md)).

### Cancellation

Implemented in `features/jobs/use-cases/cancel-job.ts`:

- Allowed from `QUEUED`, `CLAIMED`, `RENDERING` (`CANCELABLE_STATES`) — not from
  `RENDERED`, `DELIVERING`, `UPLOADED`, `ERROR`, `CANCELED`. Matches legacy intent,
  enforced by the state machine.
- **Idempotent**: canceling an already-canceled Job returns it unchanged, no error.
- Sets `state = CANCELED`, records `canceledByUserId`/`canceledAt`/`cancelReason`.
  **Never resets `progress`/`durationSeconds`/the timeline** (resolves OD-26 — historical
  integrity favors keeping the record over legacy's cosmetic zeroing).
- Authorization: any USER/MANAGER in the Job's own Department may cancel it — not
  limited to the Job's creator (resolves OD-03 for Jobs as "whole department").
- No bulk-cancel endpoint exists yet (single-Job only this phase) — the state-machine
  eligibility check is the same rule a future bulk operation would reuse.

### Retry (non-destructive)

Implemented in `features/jobs/use-cases/retry-job.ts` (ADR-0031):

- **Eligibility** (resolves OD-02): the original Job must be in `ERROR` or `CANCELED`
  (`RETRY_ELIGIBLE_STATES`) — narrower than legacy, which allowed retry from almost any
  non-terminal state. A Job that hasn't actually stopped has no reason to be retried.
- **Window**: within `JOB_RETRY_WINDOW_DAYS` (default 3, matching legacy) of the
  **original's** `createdAt`.
- **Historical integrity is absolute**: the retry copies the original's `snapshot` and
  `JobAsset` rows **verbatim**. It never re-loads the live Template and never
  re-resolves Files — if either changed since the original was created, the retry still
  renders exactly what the original was supposed to.
- Creates a **new** Job: `state = QUEUED`, `retryOfJobId = original.id`,
  `attemptNumber = original.attemptNumber + 1`, `createdByUserId` = the **original's**
  creator (legacy behavior, kept), `retriedByUserId` = whoever triggered this retry,
  `retryReason` (optional).
- The original Job is **never modified and never deleted** — verified end-to-end: after
  a retry, the original's state/timeline are untouched.
- If `deliverToYouTube`: the upload cap is re-checked inside the same transaction,
  exactly like a fresh creation.
- Concurrency: `SELECT ... FOR UPDATE` on the original Job row serializes concurrent
  retry attempts of the _same_ Job (docs/domain/jobs.md §46's "Retry Idempotency" — not
  a generic idempotency-key framework; see ADR-0031).
- Retry lineage is fully traceable via `retryOfJobId` + `attemptNumber` — a simple,
  bounded chain, not a general graph.

### Completion & delivery — not implemented this phase

The `RENDERED`/`DELIVERING`/`UPLOADED` states and their timeline timestamps
(`renderedAt`/`deliveredAt`/`uploadedAt`) are real and reachable via `transitionJob`
today (exercised directly in tests/manual verification), but nothing yet:

- Accepts a rendered result upload (`POST /jobs/:id/result` — Phase 7).
- Generates a screenshot/thumbnail or creates `JOB_ARTIFACT` File rows.
- Actually delivers to YouTube or Telegram, or records a delivery outcome.

This is deliberate — Phase 6 brief §53 excludes all of it. The state machine and
`transitionJob` primitive exist now so Phase 7 (Worker API) and later delivery phases
have a correct, tested foundation to call into rather than designing it from scratch.

### Upload cap

Implemented (ADR-0030, resolves OD-01's scope/concurrency questions for now): global,
UTC-day, count-based — `JOB_UPLOAD_DAILY_CAP` (default 3, matching legacy, configurable
via env). Enforced with a Postgres advisory transaction lock keyed by the UTC date,
taken before the count-then-insert inside the same transaction as Job creation — see
ADR-0030 for the full concurrency reasoning. Manually verified: 3 upload-enabled Jobs
succeed, a 4th is rejected with a clear message, a non-upload Job is unaffected, and two
concurrent creations never both slip past the cap.

**Still open:** whether a future per-YouTube-target cap should replace the global one —
no `YouTubeTarget` model exists yet to scope against.

### Historical integrity for Jobs

See [../data/historical-integrity.md](../data/historical-integrity.md). A Job must always
render a complete story: creator, department, template-as-it-was, asset values, full
timeline, final state, and any error reason — even years later, even if the Template was
edited/deleted and input Files were purged. **Implemented, Phase 6**: `Job.snapshot`
(Template-level) + `JobAsset` rows (resolved values, with copied File metadata) together
satisfy this without ever depending on a live Template or File row surviving — manually
verified by editing a Template after creating a Job from it and confirming the Job is
unaffected, and by deleting/canceling around an active File dependency.

### Worker identity vs User identity

The Render Worker is **never** a `User` and never becomes an `Actor` (Phase 6 brief §38,
docs/architecture/authorization.md "Non-user principals"). `claimNextJob`,
`updateJobProgress`, `updateJobDuration`, and the underlying `transitionJob` primitive
take **no `Actor` parameter at all** — they are system/Worker-level operations, not
gated by the human capability registry. This keeps the application-service boundary
ready for three distinct callers (User, Worker, a future system/scheduled caller)
without inventing a fake User account for the Worker. Phase 7's Worker Route Handlers
will authenticate the Worker's service credential first, then call these same functions
directly — no logic duplicated, per the Phase 6 brief §48.
