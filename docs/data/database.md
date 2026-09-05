# Database Direction & Entities

**`DECIDED`** — PostgreSQL + Prisma (ADR-0002). MongoDB / Mongoose from legacy is **not**
carried over.

> **Phase 0 scope note.** This page documents the **conceptual** data model and the
> constraints it must satisfy. The final `prisma/schema.prisma` is **not** written in
> Phase 0. Do not create Prisma models yet except where strictly needed to validate a
> documented decision.

## 1. Entities

| Entity                     | Deletion                                | Department-scoped            | Notes                                                             |
| -------------------------- | --------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `Department`               | Archive only (deletion = OPEN DECISION) | — (is the scope)             | Tenancy boundary.                                                 |
| `User`                     | Never (status `ACTIVE`/`DISABLED`)      | yes (`departmentId`)         | Referenced forever by Jobs/Templates/Files/audit.                 |
| `Template`                 | Soft (`status`/`deletedAt`)             | yes                          | Render recipe + asset slots. Row kept forever.                    |
| `TemplateAsset`            | With its Template (soft)                | via Template                 | Slot definitions. Could be rows or JSON on Template — see below.  |
| `Job`                      | **Never**                               | yes                          | Permanent record. Carries an immutable snapshot.                  |
| `JobAsset`                 | With its Job (never)                    | via Job                      | Resolved values. Rows or JSON on the Job — see below.             |
| `File`                     | Hard delete when safe                   | yes                          | `GALLERY_ASSET` or `JOB_ARTIFACT`.                                |
| `TelegramWizardState`      | Expired by TTL cleanup                  | via linked User              | Durable Telegram conversation state (ADR-0014).                   |
| `AuditEntry`               | Never (retention = OPEN DECISION)       | yes                          | Who did what, when.                                               |
| `WorkerCredential`         | Revoke (status)                         | —                            | Service credential(s) for the Worker (mechanism = OPEN DECISION). |
| `YouTubeTarget`            | Revoke / disconnect                     | OPEN DECISION (dept-scoped?) | Connected YouTube channel + OAuth tokens. Legacy `Channel`.       |
| `DeliveryOutcome`          | With its Job (never)                    | via Job                      | Per-target delivery result. Rows or JSON on the Job.              |
| `UploadQuotaUsage` (maybe) | Rolling / TTL                           | per cap scope                | Backs the upload cap if not computed on the fly.                  |

> **`OPEN DECISION` — assets & outcomes: related rows vs JSONB.** Template asset slots,
> resolved Job assets, and delivery outcomes can each be **child tables** or **JSONB
> columns**. _Consequence of child tables:_ queryable, FK integrity, standard.
> _Consequence of JSONB:_ trivially part of the immutable Job snapshot, fewer joins, but
> weaker constraints. Likely answer: **Template assets = child rows; the Job's snapshot =
> JSONB (immutable copy); delivery outcomes = child rows or JSONB.** Confirm in Phase 1.

## 2. Relationships (conceptual ER)

```
Department 1───* User
Department 1───* Template
Department 1───* Job
Department 1───* File
Department 1───* AuditEntry

User 1───* Template     (createdBy)
User 1───* Job          (createdBy)
User 1───* Job          (retriedBy, nullable)
User 1───* Job          (canceledBy, nullable)
User 1───* File         (uploadedBy, nullable for system artifacts)
User 0/1─1 TelegramWizardState

Template 1───* TemplateAsset
Template 1───* Job                     (templateId; Template is soft-deleted only,
                                        so this FK always resolves)
Template *───0/1 YouTubeTarget         (youtubeTargetId, nullable)

Job 1───* JobAsset            (or JSONB snapshot)
Job 1───* DeliveryOutcome
Job 0/1─1 Job                 (retryOfJobId → original job; lineage chain)
Job *───0/1 File              (videoFileId / screenshotFileId / thumbnailFileId,
                               nullable after artifact cleanup)
JobAsset *───0/1 File         (input file ref; nullable / may be deleted — snapshot
                               retains identifying metadata)
```

## 3. Constraints & indexes (requirements)

| Requirement                                                                                        | Rationale                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `User.email` unique                                                                                | Login identity.                                   |
| `User.telegramUserId` unique when not null                                                         | One Telegram account ↔ one User.                  |
| `Department.name` unique                                                                           |                                                   |
| `Template.name` unique **per department among non-deleted** _(OPEN DECISION — see templates.md)_   | Avoid confusing pickers.                          |
| `TemplateAsset (templateId, name)` unique                                                          | Slot names unique within a template.              |
| FK `Job.templateId` → `Template.id`, **no cascade delete** (Template can't be hard-deleted anyway) | Historical resolvability.                         |
| FK `Job.retryOfJobId` → `Job.id`, nullable, no cascade                                             | Retry lineage.                                    |
| Index `Job (departmentId, state, createdAt)`                                                       | Department-scoped lists + the atomic claim query. |
| Partial index for the claim query on `state = QUEUED` ordered by `createdAt`                       | Fast `FOR UPDATE SKIP LOCKED`.                    |
| Index `Job (createdByUserId)`, `Job (templateId)`                                                  | Common filters.                                   |
| Index `File (departmentId, category, createdAt)`                                                   | Gallery browsing.                                 |
| Index `File.contentHash`                                                                           | Dedup.                                            |
| Index `AuditEntry (departmentId, createdAt)`, `(targetType, targetId)`                             | Audit queries.                                    |
| `TelegramWizardState (telegramUserId)` unique; index on `updatedAt`                                | Lookup + TTL sweep.                               |

## 4. Atomic job claim

The claim operation MUST be atomic (ADR-0013). Reference implementation in PostgreSQL:

```sql
UPDATE jobs
SET state = 'CLAIMED', claimed_at = now(), claimed_by_worker = $1
WHERE id = (
  SELECT id FROM jobs
  WHERE state = 'QUEUED'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

`SKIP LOCKED` lets multiple Workers poll concurrently without blocking or double-claiming.

## 5. Transactions

Use a transaction for every multi-step write:

- **Create Job**: reserve/verify upload-cap slot + insert Job (+ assets) atomically.
- **Retry**: cap check + insert new Job + lineage link, atomically; original untouched.
- **Complete + deliver**: attach result + create artifact rows + set state + enqueue
  delivery (or write to an outbox) atomically.
- **Cancel bulk**: per-job state check + transition; partial failures reported, not
  rolled back wholesale (each job is its own unit).

## 6. Snapshots as data

The Job's immutable creation-context snapshot (ADR-0010) is stored **on the Job**
(JSONB column, or a dedicated 1:1 table). It is written once at creation and **never
updated**. It contains everything the Worker needs and everything the UI needs to render
a historical Job without touching live Template/File rows. Exact shape:
[historical-integrity.md](historical-integrity.md) (OPEN DECISION).

## 7. Migrations

- All schema changes via Prisma Migrate, checked into `prisma/migrations/`.
- Migrations must preserve the never-delete / soft-delete guarantees — no migration
  drops a Job or hard-deletes a Template.
- Data backfill for snapshots (if the snapshot model changes after Jobs exist) needs a
  deliberate migration plan — flagged as a future concern.

## 8. Legacy data migration

> **`OPEN DECISION` — import legacy Mongo data?** Not in scope unless required. If needed:
> a one-time ETL mapping `templates`/`jobs`/`files` → Studio tables, assigning a
> Department, synthesizing snapshots for historical Jobs from whatever legacy stored,
> and accepting that some legacy gaps (unset `_createdBy` on files, deleted retry
> originals) cannot be fully reconstructed. Consequence of skipping: Studio starts clean;
> legacy stays available read-only for history.
