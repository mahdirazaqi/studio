# Database Direction & Entities

**`DECIDED`** — PostgreSQL + Prisma (ADR-0002). MongoDB / Mongoose from legacy is **not**
carried over.

> **Phase 0 scope note.** This page documents the **conceptual** data model for
> everything below. `Department`, `User`, and `Session` moved from conceptual to
> **implemented** in Phase 2 (see [../architecture/database.md](../architecture/database.md),
> [../architecture/authentication.md](../architecture/authentication.md)); `File` moved
> to **implemented** in Phase 4 (see [../architecture/files.md](../architecture/files.md));
> `Template`/`TemplateAsset` moved to **implemented** in Phase 5 (see
> [../domain/templates.md](../domain/templates.md), ADR-0027). Everything else in the
> table below is still conceptual only; do not create Prisma models for it except where
> strictly needed to validate a documented decision.

## 1. Entities

| Entity                            | Deletion                                 | Department-scoped            | Notes                                                                                                                                      |
| --------------------------------- | ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Department` **(implemented)**    | Archive only (deletion = OPEN DECISION)  | — (is the scope)             | Tenancy boundary. `id`, `name`, timestamps only so far.                                                                                    |
| `User` **(implemented)**          | Never (status `ACTIVE`/`DISABLED`)       | yes (`departmentId`)         | Referenced forever by Jobs/Templates/Files/audit. `phone`/`telegramUserId`/disable-audit fields not added yet (see domain/users.md).       |
| `Session` **(implemented)**       | Row deleted on logout/expiry             | via linked User              | Auth session (ADR-0020) — not in the original Phase 0 model; added for login.                                                              |
| `Template` **(implemented)**      | Soft (`status`/`deletedAt`, independent) | yes                          | Render recipe + asset slots. Row kept forever. `youtubeTargetId` not added yet.                                                            |
| `TemplateAsset` **(implemented)** | With its Template (soft)                 | via Template                 | Slot definitions — child rows (resolves OD-22's Template half); replaced wholesale on edit.                                                |
| `Job`                             | **Never**                                | yes                          | Permanent record. Carries an immutable snapshot.                                                                                           |
| `JobAsset`                        | With its Job (never)                     | via Job                      | Resolved values. Rows or JSON on the Job — see below.                                                                                      |
| `File` **(implemented)**          | Hard delete when safe                    | yes                          | `GALLERY_ASSET` or `JOB_ARTIFACT` (only the former is created so far). `ownerJobId`/`durationSeconds` not added yet (see domain/files.md). |
| `TelegramWizardState`             | Expired by TTL cleanup                   | via linked User              | Durable Telegram conversation state (ADR-0014).                                                                                            |
| `AuditEntry`                      | Never (retention = OPEN DECISION)        | yes                          | Who did what, when.                                                                                                                        |
| `WorkerCredential`                | Revoke (status)                          | —                            | Service credential(s) for the Worker (mechanism = OPEN DECISION).                                                                          |
| `YouTubeTarget`                   | Revoke / disconnect                      | OPEN DECISION (dept-scoped?) | Connected YouTube channel + OAuth tokens. Legacy `Channel`.                                                                                |
| `DeliveryOutcome`                 | With its Job (never)                     | via Job                      | Per-target delivery result. Rows or JSON on the Job.                                                                                       |
| `UploadQuotaUsage` (maybe)        | Rolling / TTL                            | per cap scope                | Backs the upload cap if not computed on the fly.                                                                                           |

> **`OPEN DECISION` — assets & outcomes: related rows vs JSONB.** Resolved for
> **Template** assets (Phase 5): implemented as **child rows** (`TemplateAsset`), replaced
> wholesale on every Template edit rather than diffed — see
> [../domain/templates.md](../domain/templates.md) "Updating Template assets". Still open
> for resolved **Job** assets and **delivery outcomes**, neither of which exists yet.
> _Consequence of child tables:_ queryable, FK integrity, standard. _Consequence of
> JSONB:_ trivially part of the immutable Job snapshot, fewer joins, but weaker
> constraints. Likely answer for those: **the Job's snapshot = JSONB (immutable copy);
> delivery outcomes = child rows or JSONB.** Confirm when Jobs land.

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

Template 1───* TemplateAsset           (implemented, Phase 5)
Template 1───* Job                     (templateId; Template is soft-deleted only,
                                        so this FK always resolves)
Template *───0/1 YouTubeTarget         (youtubeTargetId — not added yet; no
                                        YouTubeTarget table exists, see templates.md)
TemplateAsset *───0/1 File             (defaultFileId, implemented Phase 5 — ADR-0027)

Job 1───* JobAsset            (or JSONB snapshot)
Job 1───* DeliveryOutcome
Job 0/1─1 Job                 (retryOfJobId → original job; lineage chain)
Job *───0/1 File              (videoFileId / screenshotFileId / thumbnailFileId,
                               nullable after artifact cleanup)
JobAsset *───0/1 File         (input file ref; nullable / may be deleted — snapshot
                               retains identifying metadata)
```

## 3. Constraints & indexes (requirements)

| Requirement                                                                                                                            | Rationale                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `User.email` unique                                                                                                                    | Login identity.                                              |
| `User.telegramUserId` unique when not null                                                                                             | One Telegram account ↔ one User.                             |
| `Department.name` unique                                                                                                               |                                                              |
| `Template.name` unique **per department among non-deleted** — **implemented** (ADR-0027, a hand-added partial index; see templates.md) | Avoid confusing pickers.                                     |
| `TemplateAsset (templateId, key)` unique — **implemented**                                                                             | Slot keys unique within a template.                          |
| FK `TemplateAsset.defaultFileId` → `File.id`, `onDelete: Restrict` — **implemented**                                                   | Defense-in-depth; the app-level check runs first (ADR-0027). |
| FK `Job.templateId` → `Template.id`, **no cascade delete** (Template can't be hard-deleted anyway)                                     | Historical resolvability.                                    |
| FK `Job.retryOfJobId` → `Job.id`, nullable, no cascade                                                                                 | Retry lineage.                                               |
| Index `Job (departmentId, state, createdAt)`                                                                                           | Department-scoped lists + the atomic claim query.            |
| Partial index for the claim query on `state = QUEUED` ordered by `createdAt`                                                           | Fast `FOR UPDATE SKIP LOCKED`.                               |
| Index `Job (createdByUserId)`, `Job (templateId)`                                                                                      | Common filters.                                              |
| Index `File (departmentId, category, createdAt)` — **implemented**                                                                     | Gallery browsing.                                            |
| Index `File (departmentId, kind)` — **implemented**                                                                                    | Kind filter in the gallery UI.                               |
| Index `File (departmentId, contentHash)` — **implemented** (compound, not bare `contentHash`)                                          | Advisory dedup lookup is always department-scoped.           |
| Index `AuditEntry (departmentId, createdAt)`, `(targetType, targetId)`                                                                 | Audit queries.                                               |
| `TelegramWizardState (telegramUserId)` unique; index on `updatedAt`                                                                    | Lookup + TTL sweep.                                          |

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
