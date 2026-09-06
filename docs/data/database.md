# Database Direction & Entities

**`DECIDED`** — PostgreSQL + Prisma (ADR-0002). MongoDB / Mongoose from legacy is **not**
carried over.

> **Phase 0 scope note.** This page documents the **conceptual** data model for
> everything below. `Department`, `User`, and `Session` moved from conceptual to
> **implemented** in Phase 2 (see [../architecture/database.md](../architecture/database.md),
> [../architecture/authentication.md](../architecture/authentication.md)); `File` moved
> to **implemented** in Phase 4 (see [../architecture/files.md](../architecture/files.md));
> `Template`/`TemplateAsset` moved to **implemented** in Phase 5 (see
> [../domain/templates.md](../domain/templates.md), ADR-0027); `Job`/`JobAsset` moved to
> **implemented** in Phase 6 (see [../domain/jobs.md](../domain/jobs.md), ADR-0028).
> Everything else in the table below is still conceptual only; do not create Prisma
> models for it except where strictly needed to validate a documented decision.

## 1. Entities

| Entity                            | Deletion                                 | Department-scoped            | Notes                                                                                                                                      |
| --------------------------------- | ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Department` **(implemented)**    | Archive only (deletion = OPEN DECISION)  | — (is the scope)             | Tenancy boundary. `id`, `name`, timestamps only so far.                                                                                    |
| `User` **(implemented)**          | Never (status `ACTIVE`/`DISABLED`)       | yes (`departmentId`)         | Referenced forever by Jobs/Templates/Files/audit. `phone`/`telegramUserId`/disable-audit fields not added yet (see domain/users.md).       |
| `Session` **(implemented)**       | Row deleted on logout/expiry             | via linked User              | Auth session (ADR-0020) — not in the original Phase 0 model; added for login.                                                              |
| `Template` **(implemented)**      | Soft (`status`/`deletedAt`, independent) | yes                          | Render recipe + asset slots. Row kept forever. `youtubeTargetId` not added yet.                                                            |
| `TemplateAsset` **(implemented)** | With its Template (soft)                 | via Template                 | Slot definitions — child rows (resolves OD-22's Template half); replaced wholesale on edit.                                                |
| `Job` **(implemented)**           | **Never**                                | yes (derived from Template)  | Permanent record. `snapshot` (JSONB) + `JobAsset` rows together are the immutable creation-time record — see ADR-0028.                     |
| `JobAsset` **(implemented)**      | With its Job (never)                     | via Job                      | Resolved per-slot values — child rows (resolves OD-22's Job half), each with its own copied File metadata.                                 |
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
> [../domain/templates.md](../domain/templates.md) "Updating Template assets". **Resolved
> for Job** (Phase 6, ADR-0028): the Template-level half of the snapshot is **JSONB**
> (`Job.snapshot`); the resolved per-slot values are **child rows** (`JobAsset`) — not a
> single all-JSONB blob, per the Phase 6 brief's explicit relational-model requirement.
> Still open for **delivery outcomes** — no delivery mechanism exists yet.

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

Job 1───* JobAsset            (implemented, Phase 6 — child rows, not JSONB)
Job 1───* DeliveryOutcome      (not implemented — no delivery mechanism yet)
Job 0/1─1 Job                 (retryOfJobId → original job; lineage chain — implemented)
Job *───0/1 File              (videoFileId / screenshotFileId / thumbnailFileId —
                               not implemented; no result-upload endpoint yet)
JobAsset *───0/1 File         (fileId, implemented Phase 6 — nullable/SetNull; snapshot
                               retains identifying metadata on the JobAsset row itself)
```

## 3. Constraints & indexes (requirements)

| Requirement                                                                                                                            | Rationale                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `User.email` unique                                                                                                                    | Login identity.                                                                                    |
| `User.telegramUserId` unique when not null                                                                                             | One Telegram account ↔ one User.                                                                   |
| `Department.name` unique                                                                                                               |                                                                                                    |
| `Template.name` unique **per department among non-deleted** — **implemented** (ADR-0027, a hand-added partial index; see templates.md) | Avoid confusing pickers.                                                                           |
| `TemplateAsset (templateId, key)` unique — **implemented**                                                                             | Slot keys unique within a template.                                                                |
| FK `TemplateAsset.defaultFileId` → `File.id`, `onDelete: Restrict` — **implemented**                                                   | Defense-in-depth; the app-level check runs first (ADR-0027).                                       |
| FK `Job.templateId` → `Template.id`, `onDelete: Restrict` — **implemented**                                                            | Historical resolvability (Template can't be hard-deleted anyway).                                  |
| FK `Job.retryOfJobId` → `Job.id`, nullable, `onDelete: Restrict` — **implemented**                                                     | Retry lineage.                                                                                     |
| FK `JobAsset.fileId` → `File.id`, nullable, `onDelete: SetNull` — **implemented**                                                      | A deleted File never breaks a historical `JobAsset` row — its copied metadata columns stay intact. |
| Index `Job (departmentId, state, createdAt)` — **implemented**                                                                         | Department-scoped lists.                                                                           |
| Index `Job (state, createdAt)` — **implemented**                                                                                       | The atomic claim query's `ORDER BY` + `FOR UPDATE SKIP LOCKED`.                                    |
| Index `Job (departmentId, createdAt)`, `Job (templateId)`, `Job (retryOfJobId)` — **implemented**                                      | Common filters + lineage lookup.                                                                   |
| Index `JobAsset (fileId)`, `JobAsset (jobId)` — **implemented**                                                                        | The active-dependency check (`assertNoActiveJobDependencies`) + detail-view loading.               |
| Index `File (departmentId, category, createdAt)` — **implemented**                                                                     | Gallery browsing.                                                                                  |
| Index `File (departmentId, kind)` — **implemented**                                                                                    | Kind filter in the gallery UI.                                                                     |
| Index `File (departmentId, contentHash)` — **implemented** (compound, not bare `contentHash`)                                          | Advisory dedup lookup is always department-scoped.                                                 |
| Index `AuditEntry (departmentId, createdAt)`, `(targetType, targetId)`                                                                 | Audit queries.                                                                                     |
| `TelegramWizardState (telegramUserId)` unique; index on `updatedAt`                                                                    | Lookup + TTL sweep.                                                                                |

## 4. Atomic job claim — implemented, Phase 6 (ADR-0029)

The claim operation MUST be atomic (ADR-0013). Actual implementation
(`features/jobs/repository/job-repository.ts`'s `claimNextJobRow`), a raw query — Prisma's
query builder has no `SKIP LOCKED` support:

```sql
UPDATE "jobs"
SET "state" = 'CLAIMED', "claimedAt" = now(), "updatedAt" = now()
WHERE "id" = (
  SELECT "id" FROM "jobs"
  WHERE "state" = 'QUEUED'
  ORDER BY "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING "id";
```

`SKIP LOCKED` lets multiple Workers poll concurrently without blocking or double-claiming
— manually verified against the real database with two genuinely concurrent calls, which
never returned the same Job. There is no `claimed_by_worker` column — Phase 6 has no
Worker-identity concept yet (Phase 7 introduces the Worker service credential); the claim
itself doesn't need to record _which_ Worker claimed a Job to be correct.

## 5. Transactions — implemented, Phase 6

- **Create Job** (`createJobWithAssets`): if `deliverToYouTube`, take the upload-quota
  advisory lock + count + insert Job (+ `JobAsset` rows), atomically, in one
  `$transaction`.
- **Retry** (`createRetryJob`): `SELECT ... FOR UPDATE` the original Job row + (if
  `deliverToYouTube`) the same quota lock + insert the new Job + assets, atomically;
  original untouched.
- **State transition** (`transitionJobRow`): a single conditional `UPDATE ... WHERE
state IN (fromStates)` — atomic by virtue of being one statement, no explicit
  transaction wrapper needed (see ADR-0029 for why this is sufficient).
- **Complete + deliver**: not implemented — no result-upload endpoint or delivery
  mechanism exists yet (Phase 7+).
- **Cancel bulk**: not implemented — only single-Job cancel exists this phase; it reuses
  the same conditional-update transition primitive.

## 6. Snapshots as data — implemented, Phase 6 (ADR-0028)

The Job's immutable creation-context snapshot is split in two, resolving OD-16/OD-22:

- **`Job.snapshot`** (JSONB) — the Template-level render fields and ordered asset-slot
  definitions, as they were at creation.
- **`JobAsset`** rows — the resolved per-slot values, each carrying its own copied File
  metadata.

Both are written once, inside the creation transaction, and **never updated** afterward.
The (future) Worker fetch response and every historical-Job UI view are built from these,
never from a live Template/File read. Exact shape: [historical-integrity.md](historical-integrity.md).

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
