# Domain: Jobs

**Implemented, Phase 6** (this page's business rules); **the Worker REST API is
implemented, Phase 7** (see [../integrations/worker-api.md](../integrations/worker-api.md),
ADR-0032/0033/0034/0040); **Telegram is implemented, Phase 8** (see
[../integrations/telegram.md](../integrations/telegram.md), ADR-0035–0038) — it creates
Jobs through the unmodified `createJob`/`cancelJob`/`retryJob` use cases below, adding no
Job-domain logic of its own. **Rendered-result acceptance and media processing
implemented, Phase 9** (ADR-0039) — see "Rendered result" below.
[../architecture/decisions.md](../architecture/decisions.md) ADR-0028/0029/0031/0039/0041
records the decisions behind the shape below, and
[`prisma/schema.prisma`](../../prisma/schema.prisma) is the final schema. **Still not
implemented:** rendering itself (the external Render Worker's own job).

**Studio does not upload rendered Jobs to YouTube (or anywhere else) — ADR-0041.** A
Job's lifecycle ends at `RENDERED`, the moment the Worker's rendered result is accepted.
This page and the rest of the schema were revised accordingly; see ADR-0041 for the full
removal record if you're looking for what used to exist here.

## Purpose

A **Job** is one concrete render request: a Template with every asset slot filled,
tracked through a state machine from creation to a successful render (or a failure).
**A Job is the permanent historical record of the pipeline.**

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
  server-side only). Legacy's `Uploaded` meant "successfully delivered to YouTube (or no
  delivery was needed)" — Studio has no equivalent concept, see ADR-0041.
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
   raw SQL statement, filtered by the Worker's own authenticated Department scope
   (ADR-0040). Manually verified: two concurrent claims never return the same Job.
5. **Retry never destroys the original** — it creates a new linked Job, copying the
   original's snapshot and assets verbatim (ADR-0031).
6. **Every Job belongs to a Department**, resolved from its Template — never a separate,
   client-supplied field — and is authorized accordingly.
7. **A Job's lifecycle ends at `RENDERED`** (ADR-0041) — there is no delivery step after
   a successful render. `RENDERED` is a terminal state, exactly like `ERROR`/`CANCELED`.

### State machine

Implemented in `features/jobs/domain/job-state-machine.ts`. Legacy mapping in
[../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).

| State       | Meaning                                                                      | Set by                              |
| ----------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| `QUEUED`    | Created, waiting for a Worker.                                               | `createJob` / `retryJob`            |
| `CLAIMED`   | An atomic claim assigned it to a Worker.                                     | `claimNextJob`                      |
| `RENDERING` | Worker is actively rendering (covers legacy Downloading/Started/InProgress). | Worker (via `transitionJob`)        |
| `RENDERED`  | Render finished; result file accepted. **Terminal (success).**               | Worker (via `transitionJob`)        |
| `ERROR`     | Render failed; carries `errorReason`.                                        | Worker/Studio (via `transitionJob`) |
| `CANCELED`  | Canceled by an operator. **Terminal.**                                       | `cancelJob`                         |

Allowed transitions (implemented, `job-state-machine.ts`):

```
QUEUED    → CLAIMED, CANCELED
CLAIMED   → RENDERING, QUEUED (requeue on worker timeout — not yet swept), ERROR, CANCELED
RENDERING → RENDERED, ERROR, CANCELED
RENDERED, ERROR, CANCELED → (terminal — no outgoing transitions)
```

**Revised, ADR-0041: `DELIVERING`/`UPLOADED` removed.** Studio no longer uploads a
rendered Job anywhere — `RENDERED` is now the terminal, successful completion state
itself, reached directly from `RENDERING`.

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
> states (2/3/4 for Downloading/Started/InProgress); the Worker API (Phase 7) maps all
> three onto `RENDERING` (this phase's canonical state set has no substates) — whether
> Studio should ever track finer-grained render substates internally stays open.

### Fields (implemented; final schema in [`prisma/schema.prisma`](../../prisma/schema.prisma))

| Field                                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                                 | Permanent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `departmentId`                                       | Required. **Derived from the chosen Template's department** — never a separate, client-supplied field (Phase 6 brief §4).                                                                                                                                                                                                                                                                                                                                                      |
| `createdByUserId`                                    | Permanent reference. On a retry, this stays the **original creator** (legacy behavior, kept) — see `retriedByUserId`.                                                                                                                                                                                                                                                                                                                                                          |
| `templateId`                                         | FK to the Template (kept resolvable forever — Template is soft-deleted only). Convenience/active-dependency only — never the source of truth for a historical Job's meaning.                                                                                                                                                                                                                                                                                                   |
| `snapshot`                                           | **Immutable JSONB.** Template render fields + ordered asset-slot definitions at creation. See "Job assets" below for the _resolved values_, which are **not** in this column (ADR-0028).                                                                                                                                                                                                                                                                                       |
| `title`                                              | Derived from `DATA` asset values at creation, joined `" \| "` (legacy rule kept). Stored, never recomputed.                                                                                                                                                                                                                                                                                                                                                                    |
| `state`                                              | From the state machine. Written only via `transitionJobRow`'s atomic conditional update.                                                                                                                                                                                                                                                                                                                                                                                       |
| `progress`                                           | 0–100, nullable until the Worker's first report. Rejected once the Job is terminal.                                                                                                                                                                                                                                                                                                                                                                                            |
| `durationSeconds`                                    | Nullable until reported. Rejected once the Job is terminal.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `retryOfJobId`, `attemptNumber`                      | Non-destructive retry lineage (ADR-0031). `attemptNumber` is 1 for an original, `original.attemptNumber + 1` for a retry.                                                                                                                                                                                                                                                                                                                                                      |
| `retriedByUserId`, `retryReason`                     | Who triggered a retry-created Job, and why (optional).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `canceledByUserId`, `canceledAt`, `cancelReason`     | Set once, by `cancelJob`. Never resets `progress`/`durationSeconds` (resolves OD-26).                                                                                                                                                                                                                                                                                                                                                                                          |
| `errorReason`                                        | Human-readable failure reason. Surfaced in the UI; never a stack trace.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `claimedAt`, `startedAt`, `renderedAt`               | Timeline — each set once, the first time `transitionJob` reaches the corresponding state. Never reset.                                                                                                                                                                                                                                                                                                                                                                         |
| `videoFileId`, `screenshotFileId`, `thumbnailFileId` | **Implemented, Phase 9.** The rendered result and its derived images (`JOB_ARTIFACT` Files), set atomically together with the `RENDERING -> RENDERED` transition — the Job's final, successful completion (ADR-0041). `null` until a Worker successfully posts a result. `onDelete: SetNull` — `cleanupJobArtifacts` may hard-delete the video File once it's no longer needed. Independent of any delivery destination — these exist for the dashboard's own Job detail view. |
| `createdAt`, `updatedAt`                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Removed, ADR-0041:** `deliverToYouTube`, `deliveredAt`, `uploadedAt` — Studio has no
YouTube (or any other external) delivery step, so there was nothing left for these to
describe. **Not present, deliberately:** `deliverToTelegram` — Telegram notification is
automatic and best-effort for any linked creator, with no per-Job flag, matching
legacy's own unconditional `sendTelegramMessage` calls.

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
3. Reject if the Template is soft-deleted or `status !== "ACTIVE"` — enforced here, once,
   for both entry points that create Jobs (the dashboard's Server Action and, since Phase
   8, the Telegram bot) — both call this exact function, so there is no second copy of
   this check to keep in sync.
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
7. Create the Job `state = QUEUED` with its `JobAsset` rows.

**No upload cap, no delivery configuration** (ADR-0041) — there is nothing left in Job
creation that needs an upload quota or a delivery-destination check.

**Aspect-ratio validation is not implemented.** A Template slot's `imageRatio` is
recorded on the slot definition and copied into the snapshot, but Job creation does not
yet compare an uploaded image's actual dimensions against it — no feature does that yet
(OD-14 stays open, unaffected by this phase).

### Worker claim (atomic)

`claimNextJob(allowedDepartmentIds)` (`features/jobs/use-cases/claim-next-job.ts`, no
`Actor` — see "Worker identity vs User identity" below) selects the oldest `QUEUED` Job
**within the authenticated Worker's Department scope** and moves it to `CLAIMED` in one
atomic raw SQL statement: `UPDATE jobs SET state = 'CLAIMED', ... WHERE id = (SELECT id
FROM jobs WHERE state = 'QUEUED' AND "departmentId" = ANY(allowedDepartmentIds) ORDER BY
"createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`. Two concurrent Workers can
never receive the same Job — manually verified against the real database with two
genuinely concurrent calls, and again at the HTTP layer once Phase 7 exposed it.
Legacy's non-atomic `fetch` is exactly what this fixes. **Exposed over REST, Phase 7**:
`POST /api/v1/worker/jobs/next` calls this directly, after its own Worker-credential
authentication — see [../integrations/worker-api.md](../integrations/worker-api.md).

FIFO by `createdAt` within scope — matches legacy's single shared queue, narrowed by
Department since Phase 11 (ADR-0040). Priority/fairness/capability filtering are not
planned (unchanged OPEN DECISION, [../integrations/worker-api.md](../integrations/worker-api.md)).

### Cancellation

Implemented in `features/jobs/use-cases/cancel-job.ts`:

- Allowed from `QUEUED`, `CLAIMED`, `RENDERING` (`CANCELABLE_STATES`) — not from
  `RENDERED`, `ERROR`, `CANCELED`. Matches legacy intent, enforced by the state machine.
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
- Concurrency: `SELECT ... FOR UPDATE` on the original Job row serializes concurrent
  retry attempts of the _same_ Job ("Retry Idempotency" — not a generic idempotency-key
  framework; see ADR-0031).
- Retry lineage is fully traceable via `retryOfJobId` + `attemptNumber` — a simple,
  bounded chain, not a general graph.

**Removed, ADR-0041: "Job Retry vs Delivery Retry."** Delivery Retry
(`retryJobDelivery`) no longer exists — there is no delivery to retry. Job Retry itself
is completely unaffected by that removal; it never was the same operation.

### Rendered result — implemented, Phase 9 (ADR-0039, revised ADR-0041)

`RENDERED` and its timeline timestamp (`renderedAt`) are driven by a real, tested path:

- `POST /api/v1/worker/jobs/:id/upload` accepts the rendered result (Studio's equivalent
  of legacy's `POST /jobs/:id/upload`) — `features/delivery/use-cases/
accept-job-result.ts`. Multipart (`"file"` field), and — unlike every other Worker Job
  operation — **not required to carry a Worker credential** (ADR-0043; the real Worker's
  upload call sends none), with the Job's own render state as the compensating gate
  instead of Department scope when none is presented. Idempotent against a
  duplicate/racing request.
- `features/delivery/use-cases/generate-render-artifacts.ts` (`MediaProcessingService`)
  generates a screenshot + thumbnail via `ffmpeg` and creates all three `JOB_ARTIFACT`
  File rows, set atomically together with the `RENDERING -> RENDERED` transition.
- Once that atomic transition commits, `accept-job-result.ts` sends one best-effort
  "rendered" Telegram notification (if the Job's creator has a linked Telegram account)
  and returns. **No further state transition is attempted, and no external delivery
  call is ever made** — `RENDERED` is the Job's final state.

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
gated by the human capability registry. `claimNextJob`/`getJobForWorker`/
`transitionJobForWorker`/`updateJobProgress`/`updateJobDuration`/`acceptJobResult` all
take an `allowedDepartmentIds: string[]` (from the authenticated `WorkerApiKey`,
ADR-0040) instead — that is not an `Actor` and must not be treated like one.
**Implemented, Phase 7 (Department scoping, Phase 11)**: the Worker Route Handlers
under `src/app/api/v1/worker/**` authenticate the Worker's service credential
(`authenticateWorker`, ADR-0040) first, then call these same functions directly — no
logic duplicated, exactly as planned. See
[../integrations/worker-api.md](../integrations/worker-api.md).
