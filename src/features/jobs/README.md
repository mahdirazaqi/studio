# feature: jobs

**Scope:** Job creation, the state machine, assets, progress/duration, cancellation, and
non-destructive retry. **Status: implemented (Phase 6)** — domain/application layer +
dashboard UI. Also the reusable application services a future Worker REST API will call
(atomic claim, progress/duration, state transition) — not exposed over REST yet.

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
              eligibility — pure, unit-tested), build-job-title.ts, job-asset-rules.ts
schemas/      job-asset-input.schema.ts, create-job.schema.ts, cancel-job.schema.ts,
              retry-job.schema.ts, list-jobs.schema.ts, update-progress/duration.schema.ts
repository/   job-repository.ts — the only module querying Job/JobAsset; also exports
              countActiveJobAssetReferencesToFile for the Files feature's deletion check
use-cases/    create-job, resolve-job-assets, get-job, list-jobs, cancel-job, retry-job,
              claim-next-job, transition-job, update-job-progress, update-job-duration,
              get-template-for-job-form (human-facing use cases take an Actor; the
              Worker-facing ones — claim/progress/duration/transition — take none)
actions/      create/cancel/retry Server Actions, plus get-template-for-job-form (a
              small action backing the create form's dynamic asset inputs)
components/   JobCreateForm, JobListItem, JobActions (Cancel/Retry), JobsToolbar,
              JobStatusBadge
```

**Not built yet, deliberately:** the Worker REST API (Phase 7 — this feature exists so
that phase only has to write thin Route Handlers), Worker authentication, Telegram,
YouTube delivery, rendering, a result-upload endpoint, `JOB_ARTIFACT` creation, a
Worker-timeout requeue sweep (the `CLAIMED → QUEUED` transition exists in the graph for
it), bulk cancel, `deliverToTelegram` (no Telegram linking on `User` yet).
