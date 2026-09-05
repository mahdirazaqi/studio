# Domain: Jobs

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

## Part B — Studio design

### Core rules

1. **A Job is never deleted** — no hard delete, no soft delete (ADR-0005).
2. **A Job carries an immutable snapshot** of its Template + resolved asset values at
   creation time (ADR-0010). The Worker is served from the snapshot.
3. **State transitions are explicit and validated** (ADR-0013). No arbitrary state.
4. **Job claiming by the Worker is atomic** — no double-claim.
5. **Retry never destroys the original** — it creates a new linked Job.
6. **Delivery is durable** — recorded outcome per target, never fire-and-forget
   (ADR-0016).
7. **Every Job belongs to a Department** and is authorized accordingly.

### State machine

Proposed Studio states (names; internal representation TBD). Legacy mapping in
[../legacy/compatibility-matrix.md](../legacy/compatibility-matrix.md).

| State        | Meaning                                                                      | Set by                  |
| ------------ | ---------------------------------------------------------------------------- | ----------------------- |
| `QUEUED`     | Created, waiting for a Worker.                                               | Studio (create / retry) |
| `CLAIMED`    | An atomic claim assigned it to a Worker.                                     | Studio (`claimNextJob`) |
| `RENDERING`  | Worker is actively rendering (covers legacy Downloading/Started/InProgress). | Worker                  |
| `RENDERED`   | Render finished; result file uploaded/attached.                              | Worker / Studio         |
| `DELIVERING` | Post-render delivery (YouTube/Telegram) in progress.                         | Studio                  |
| `UPLOADED`   | All required delivery succeeded. **Terminal (success).**                     | Studio                  |
| `ERROR`      | Render or delivery failed; carries a reason.                                 | Worker / Studio         |
| `CANCELED`   | Canceled by an operator. **Terminal.**                                       | Studio                  |

Allowed transitions (proposed):

```
QUEUED    → CLAIMED, CANCELED
CLAIMED   → RENDERING, QUEUED (requeue on worker timeout), ERROR, CANCELED
RENDERING → RENDERED, ERROR, CANCELED
RENDERED  → DELIVERING, UPLOADED (if no delivery needed), ERROR
DELIVERING→ UPLOADED, ERROR
ERROR     → (no direct transition; recovery is retry = new Job)
UPLOADED  → (terminal)
CANCELED  → (terminal)
```

- Any transition not in the map is **rejected** at the use-case boundary.
- `CANCELED` is reachable only from non-terminal, non-`RENDERED`+ states (see cancel
  eligibility below) — mirrors legacy intent but enforced.
- A Worker that goes silent past a timeout: a Studio task may move `CLAIMED`/`RENDERING`
  back to `QUEUED` (requeue) or to `ERROR`. Timeout policy = OPEN DECISION.

> **`OPEN DECISION` — exact state set & whether the Worker reports fine-grained substates
> (downloading/started).** _Consequence of collapsing into `RENDERING`:_ simpler, but the
> Worker currently sends numeric 2/3/4 — the Worker API must accept and map them.
> _Consequence of keeping substates:_ closer to legacy, more UI detail, larger state map.
> The compatibility matrix assumes the Worker API **accepts** legacy numeric states and
> maps them; internal canonical states can still be the smaller set.

### Fields (conceptual — final schema in [../data/database.md](../data/database.md))

| Field                                                               | Notes                                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                | Permanent.                                                                                                                                |
| `departmentId`                                                      | Required. Set from creator's context.                                                                                                     |
| `createdByUserId`                                                   | Permanent reference.                                                                                                                      |
| `templateId`                                                        | FK to the Template (kept resolvable forever — Template is soft-deleted only).                                                             |
| `snapshot`                                                          | **Immutable.** Template render fields + asset-slot defs + resolved asset values at creation. Shape = OPEN DECISION (ADR-0010).            |
| `title`                                                             | Derived from `DATA` asset values at creation (legacy rule kept). Stored, not recomputed.                                                  |
| `state`                                                             | From the state machine.                                                                                                                   |
| `progress`                                                          | 0–100, from the Worker.                                                                                                                   |
| `durationSeconds`                                                   | Rendered video duration, from the Worker.                                                                                                 |
| `deliverToYouTube`                                                  | Whether to publish to YouTube on completion.                                                                                              |
| `deliverToTelegram`                                                 | Whether to DM the creator the file (default true if creator linked? OPEN DECISION).                                                       |
| `retryOfJobId`                                                      | Nullable. Links a retry attempt to the Job it retried.                                                                                    |
| `attemptNumber`                                                     | 1 for an original; `parent.attemptNumber + 1` for a retry.                                                                                |
| `retriedByUserId`, `retryReason`                                    | On retry-created Jobs.                                                                                                                    |
| `canceledByUserId`, `canceledAt`, `cancelReason`                    | On cancellation.                                                                                                                          |
| `errorReason`                                                       | Human-readable failure reason (render or delivery). Surfaced in UI.                                                                       |
| `claimedAt`, `startedAt`, `renderedAt`, `deliveredAt`, `uploadedAt` | Timeline.                                                                                                                                 |
| `deliveryOutcomes`                                                  | Per-target result: `{ target, status, reason, at }`.                                                                                      |
| `videoFileId`, `screenshotFileId`, `thumbnailFileId`                | FKs to `File` rows (category `JOB_ARTIFACT`). May be null after artifact cleanup — the record stays coherent via the snapshot + timeline. |
| `createdAt`, `updatedAt`                                            |                                                                                                                                           |

### Job assets

Each resolved asset on a Job (part of / alongside the snapshot):

| Field                  | Notes                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `slotName`             | Matches a Template asset `name`.                                                                                                                                                                                                                                               |
| `kind`                 | `DATA` \| `IMAGE` \| `AUDIO` \| `VIDEO` \| `SCRIPT` (script injected).                                                                                                                                                                                                         |
| `composition`, `layer` | Passed through to the Worker.                                                                                                                                                                                                                                                  |
| `text`                 | For `DATA`.                                                                                                                                                                                                                                                                    |
| `fileRef`              | For file kinds: the file path/reference the Worker should use, **captured at creation**. Plus enough identifying metadata (original name, mime, size, and the source `File.id` if it was a gallery asset) that the Job stays meaningful even if the File row is later deleted. |

### Creation

1. Authorize: actor may create Jobs in the target Department.
2. Load Template — must be same Department, `status = ACTIVE` (not `DISABLED`/`DELETED`).
   **Enforced on web and Telegram alike.**
3. For each Template asset slot, require a value:
   - `DATA` → literal text; contributes to `title`.
   - file kinds → a `File` the actor's Department may use; validate kind matches, and for
     images validate aspect ratio with tolerance.
4. Inject the script asset.
5. Build the immutable `snapshot`.
6. If `deliverToYouTube`: enforce the upload cap (see below) **before** creating anything.
7. Create the Job `state = QUEUED`.
8. Audit entry.

### Worker claim (atomic)

`claimNextJob(worker)` selects the oldest `QUEUED` Job and moves it to `CLAIMED` in a
single atomic operation — PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` inside a
transaction, or an `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`.
Two concurrent Workers can never receive the same Job. Legacy's non-atomic `fetch` is the
thing this explicitly fixes.

> **`OPEN DECISION` — claim scope & ordering.** FIFO by `createdAt` is assumed. Priority,
> per-department fairness, or per-Worker capability filtering are not planned.

### Cancellation

- Allowed from: `QUEUED`, `CLAIMED`, `RENDERING` (i.e. not from `RENDERED`, `DELIVERING`,
  `UPLOADED`, `ERROR`, `CANCELED`). Matches legacy intent, enforced by the state machine.
- Bulk cancel: jobs in an ineligible state are **reported back as skipped**, not errors
  (legacy behavior kept).
- Sets `state = CANCELED`, records actor + timestamp + optional reason.
- The Worker is informed on its next interaction that the Job is canceled (it should stop).

### Retry (non-destructive)

- Eligibility: original Job is in `ERROR` (or `CANCELED`? OPEN DECISION) **and** within
  the retry age window.
  > **`OPEN DECISION` — retry age window.** Legacy used **3 days from creation**. Keep,
  > change, or drop? _Consequence of keeping 3 days:_ familiar, bounds worker/queue
  > churn. _Consequence of dropping the limit:_ operators can always retry old failures,
  > but a very old snapshot may reference deleted files. Recommended: **keep a window,
  > default 3–7 days, configurable.**
- Creates a **new** Job:
  - copies the `snapshot` from the original (so it renders the same inputs),
  - `state = QUEUED`, `retryOfJobId = original.id`,
    `attemptNumber = original.attemptNumber + 1`, `retriedByUserId`, `retryReason`.
- The original Job is **never modified destructively and never deleted**.
- If `deliverToYouTube`: check the upload cap **before** creating the new Job.
- Audit entry (legacy omitted this).
- Retry lineage is fully traceable: `retryOfJobId` chain + `attemptNumber`.

### Completion & delivery

- On result upload: store bytes, generate screenshot + thumbnail (via safe `execFile`),
  create `JOB_ARTIFACT` File rows, set `RENDERED`.
- Schedule durable delivery:
  - `deliverToYouTube` → YouTube adapter (video + thumbnail; description/tags from the
    **snapshot**).
  - `deliverToTelegram` → send document to the creator (if linked).
- Record each target's outcome. On full success → `UPLOADED`. On failure → `ERROR` with
  `errorReason`, and the operator is notified with the reason.

### Upload cap

Legacy: hard-coded **global** cap of **3 per UTC day**, all users combined, presumably a
stand-in for the YouTube Data API quota.

> **`OPEN DECISION` — upload cap model.** Decide: (a) the value, (b) the scope
> (global / per-Department / per-YouTube-target), (c) the window (UTC day?), (d) whether
> it is configurable, (e) behavior when exceeded (reject at creation — legacy — vs.
> queue-and-defer). _Consequence of global:_ simplest, protects a single shared API
> quota, but one department can starve others. _Consequence of per-target:_ aligns with
> the real YouTube quota which is per project/channel, fairer, more config. Recommended
> starting point: **per-YouTube-target daily cap, configurable, reject at creation with a
> clear message**, pending confirmation of how the YouTube quota is actually structured.

### Historical integrity for Jobs

See [../data/historical-integrity.md](../data/historical-integrity.md). A Job must always
render a complete story: creator, department, template-as-it-was, asset values, full
timeline, final state, and any error reason — even years later, even if the Template was
edited/deleted and input Files were purged.
