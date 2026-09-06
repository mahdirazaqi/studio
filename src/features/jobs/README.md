# feature: jobs

**Scope:** Job creation, the state machine, assets, progress/duration, cancellation, and
non-destructive retry. **Status: implemented (Phase 6; extended Phase 7)** —
domain/application layer + dashboard UI, plus the Worker-facing adapters
(`app/api/worker/v1/jobs/**`) that expose the same use cases (atomic claim,
progress/duration, state transition) to the external Render Worker over REST.

**Key rules** (`docs/domain/jobs.md`, ADR-0005/0010/0013/0028/0029/0030/0031):

- A Job is **never deleted** and never generically edited (no hard/soft delete, no
  `editJob`). Every mutation is one of the named lifecycle operations.
- A Job's historical record is split in two: `Job.snapshot` (JSONB, Template-level
  fields, immutable) + `JobAsset` rows (resolved per-slot values with copied File
  metadata, immutable). Neither is ever updated after creation.
- State transitions are **explicit and validated**
  (`features/jobs/domain/job-state-machine.ts`); every write to `Job.state` is one
  atomic conditional `UPDATE`, never a read-then-write.
- The Worker claim is **atomic** (`SELECT ... FOR UPDATE SKIP LOCKED`) — verified
  race-free against the real database.
- Retry creates a **new linked Job**, copying the original's snapshot/assets verbatim;
  the original is never touched. Eligible only from `ERROR`/`CANCELED`, within a
  configurable window.
- The daily upload quota (`deliverToYouTube: true` Jobs) is global, UTC-day, and
  enforced with a Postgres advisory transaction lock — never a plain count-then-insert.
- `job:manage` (view/create/cancel/retry) is USER+, whole-department — not limited to a
  Job's creator.
- **Delivery is not implemented** — `DELIVERING`/`UPLOADED` are real, reachable states,
  but nothing drives a Job into them via an actual delivery mechanism yet.

**Layout:**

```
domain/       job.ts (types), job-state-machine.ts (transition graph, cancel/retry
              eligibility — pure, unit-tested), build-job-title.ts, job-asset-rules.ts,
              legacy-state-mapping.ts (Phase 7 — legacy int ↔ Studio JobState),
              worker-job-payload.ts (Phase 7 — SafeJobDetail → legacy-shaped Worker JSON)
schemas/      job-asset-input.schema.ts, create-job.schema.ts, cancel-job.schema.ts,
              retry-job.schema.ts, list-jobs.schema.ts, update-progress/duration.schema.ts,
              worker-transition.schema.ts (Phase 7 — accepts legacy int or Studio name)
repository/   job-repository.ts — the only module querying Job/JobAsset; also exports
              countActiveJobAssetReferencesToFile for the Files feature's deletion check,
              and findJobById (Phase 7 — unscoped, for the Worker's shared-credential
              trust model, see docs/development/open-decisions.md OD-30)
use-cases/    create-job, resolve-job-assets, get-job, list-jobs, cancel-job, retry-job,
              claim-next-job, transition-job, update-job-progress, update-job-duration,
              get-template-for-job-form (human-facing use cases take an Actor); the
              Worker-facing ones take no Actor — claim-next-job, update-job-progress,
              update-job-duration (Phase 6), plus get-job-for-worker.ts and
              transition-job-for-worker.ts (Phase 7 — thin adapters over get-job/
              transition-job for the Route Handlers)
actions/      create/cancel/retry Server Actions, plus get-template-for-job-form (a
              small action backing the create form's dynamic asset inputs)
components/   JobCreateForm, JobListItem, JobActions (Cancel/Retry), JobsToolbar,
              JobStatusBadge
```

**Worker REST API (Phase 7):** `app/api/worker/v1/jobs/{next,[jobId],[jobId]/state,
[jobId]/progress,[jobId]/duration}` — thin `defineRouteHandler`s authenticated by
`@/server/worker-auth` (a shared static `WORKER_API_KEY`, not an `Actor`), calling the
Worker-facing use cases above. See
[`docs/integrations/worker-api.md`](../../../docs/integrations/worker-api.md) for the
full contract.

**Not built yet, deliberately:** Telegram, YouTube delivery, rendering, a result-upload
endpoint (the Worker cannot yet report a produced output File), `JOB_ARTIFACT` creation,
a Worker-timeout requeue sweep (the `CLAIMED → QUEUED` transition exists in the graph for
it), bulk cancel, `deliverToTelegram` (no Telegram linking on `User` yet), Worker API
rate limiting (OD-41).
