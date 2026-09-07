# Data Flow

End-to-end flows. All flows converge on the same use-case layer regardless of transport.

## 1. Create → Render → Deliver (web UI)

```
Operator (browser)
  │  submits "create job" form
  ▼
Server Action  features/jobs/actions/create-job.action.ts
  │  get session • validate input (Zod) • call use case
  ▼
Use case  createJob(actor, input)
  │  1. authorize: actor may create jobs in target department
  │  2. load Template (must be in same department, not soft-deleted)
  │  3. validate every asset slot has a value; resolve File references
  │     (each File must be readable by the actor's department)
  │  4. build immutable SNAPSHOT of template + resolved asset values
  │  5. repository.create(job, state = QUEUED)
  │  6. write audit entry
  ▼
Job row (state = QUEUED)  +  snapshot stored on the job

... time passes ...

Render Worker
  │  GET /api/worker/v1/jobs/next   (service credential)
  ▼
Route Handler → use case  claimNextJob(worker)
  │  ATOMIC claim: pick oldest QUEUED job and set state = CLAIMED
  │  (SELECT ... FOR UPDATE SKIP LOCKED, or UPDATE ... RETURNING on a CTE)
  ▼
returns { jobId, composition, templateSource, output, assets }  (from snapshot)

Render Worker
  │  PATCH /api/worker/v1/jobs/:id/state   { state: RENDERING }
  │  PATCH /api/worker/v1/jobs/:id/progress { progress: 0..100 }   (repeated)
  │  PATCH /api/worker/v1/jobs/:id/duration { seconds }
  ▼
use cases  changeState / reportProgress / reportDuration
  │  validate transition against the state machine
  │  on RENDERED: record renderedAt, notify operator (durable), emit event
  ▼

Render Worker
  │  POST /api/worker/v1/jobs/:id/result   (raw video bytes, not multipart)
  ▼
Route Handler → use case  acceptJobResult(job, videoBuffer)
  │  store video bytes via storage adapter
  │  generate screenshot + thumbnail (ffmpeg only, execFile — ADR-0039)
  │  persist artifact File rows (category = JOB_ARTIFACT)
  │  set state = RENDERED, atomically, together with the artifact File ids
  │     ← this is the Job's final, successful state (ADR-0041) — no delivery step
  │  send a best-effort "rendered" Telegram notification (never blocks the Job)
  ▼
Operator sees the final state in the panel; gets a Telegram notification if linked
```

### Durability requirements in this flow

- **Job claim is atomic** — two concurrent workers can never claim the same job.
  (Legacy `findOne` + later `save` had a race; do not reproduce.)
- **There is no delivery step to make durable** — a Job's lifecycle ends at `RENDERED`
  (ADR-0041). Result acceptance itself (the state transition + artifact File creation)
  is the one atomic unit that must never be stuck silently: every Job either reaches a
  terminal state or is visibly retryable.
- **State transitions are validated** — the worker cannot set an arbitrary integer.

## 2. Create via Telegram (durable wizard)

```
Telegram user → Telegram (webhook or long-poll) → Telegram Adapter
  │  resolve identity: telegram user id → linked User (+ department + role)
  │  if not linked → prompt to authenticate (share phone) → link on match
  ▼
Adapter loads/updates the WIZARD STATE ROW for this telegram user (PostgreSQL)
  │  step: pick template → fill each asset slot one message at a time
  │  each inbound message advances the row; nothing is kept in memory
  ▼
when all slots filled:
  Adapter → use case  createJob(actor = linked user, input)   ← same use case as web
  Adapter clears the wizard row
```

- **Wizard state lives in PostgreSQL**, keyed by telegram user id, with a step field, a
  partial-input payload, and a timestamp for TTL cleanup.
- **Authorization is identical to the web UI** — the linked User's role and department
  apply. A Telegram user with no `job:create` permission cannot create a job.
- **"Album" flow** (one conversation → many jobs) is preserved conceptually: see
  [../integrations/telegram.md](../integrations/telegram.md).

## 3. Retry (non-destructive)

```
Operator/Telegram → retryJob(actor, originalJobId)
  │  1. authorize (job:retry in the job's department)
  │  2. load original job; check retry eligibility (state + age rules — see jobs.md)
  │  3. create a NEW job:
  │       - copies the snapshot (template + asset values) from the original
  │       - state = QUEUED
  │       - retryOfJobId = original.id   (lineage preserved)
  │       - attemptNumber = original.attemptNumber + 1
  │       - retriedByUserId, retryReason, createdAt
  │  4. original job is UNTOUCHED (never deleted, never mutated destructively)
  │  5. audit entry
```

Legacy deleted the original job (destructively) before creating the retry, so a failed
retry could leave the user with nothing. Studio never deletes the original.

## 4. Cancel

```
Operator/Telegram → cancelJobs(actor, ids[])
  │  for each job the actor may cancel AND whose current state allows cancel:
  │     transition to CANCELED (records canceledAt, canceledByUserId)
  │  jobs in a terminal/ineligible state are reported back as skipped (not errors)
  │  audit entry per canceled job
```

Cancellation is a **state transition**, not a delete. The job row remains forever.

## 5. Notifications

| Event        | Channel(s)                                           | Notes                                                                                          |
| ------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Job RENDERED | Telegram DM (if creator linked)                      | Best-effort, never blocks the Job. `RENDERED` is the Job's final, successful state (ADR-0041). |
| Job ERROR    | Not currently notified — see `accept-job-result.ts`. | Only the render-success path sends a notification this phase.                                  |

Notification delivery is best-effort but **logged**; a failed notification never blocks
or reverts a job transition.
