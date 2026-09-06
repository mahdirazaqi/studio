# Historical Data Integrity

**`DECIDED`** as a hard requirement — ADR-0009, ADR-0010. This is one of the most
important architectural constraints in Studio.

## 1. The requirement

A user opening **any** Job, at **any** point in the future, must see a **complete,
coherent record**:

- the Job exists ✔ (it always will — never deleted)
- its **Template** is shown, as it was **at the time the Job was created**
- its **creator** (and retrier/canceller) is shown
- every **asset value** is shown (the literal text, and for media: what file it was —
  name, type, size, preview if the bytes still exist)
- the full **timeline** and **final state** (and error reason, if any) are shown

The user must **never** see:

- "Job exists but its Template is missing"
- "creator: unknown / deleted"
- "asset: (referenced data was destroyed)"
- a crash / broken link when opening an old Job

## 2. Why a foreign key is not enough

- **Templates get edited.** An FK to a live Template row would show the _current_
  definition, not the one the Job actually rendered. The Job's title, tags, and asset
  meaning could all silently change.
- **Files get hard-deleted** (ADR-0008). An FK to a File row can become dangling.
- **Composition/output semantics** the Worker used are whatever the Template said _then_.

So: FKs are kept for **active dependency checks and convenience joins**, but historical
correctness relies on **immutable snapshots**, not FKs.

## 3. The snapshot (ADR-0010, ADR-0028) — implemented, Phase 6

At Job creation, Studio writes an **immutable** record — split across two places, not one
column. It is written once and **never updated**. It is also what a future Worker fetch
response will be built from.

### Snapshot contains (implemented)

| From Template (`Job.snapshot`, JSONB)                 | From resolved assets (`JobAsset` rows)                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templateId` + `templateName` (as-was)                | For each slot: `slotKey`, `kind`, `composition`, `layer`                                                                                                         |
| `composition`, `source`, `outputPattern`, `scriptRef` | `DATA` (and the injected `SCRIPT` row): the literal `textValue`                                                                                                  |
| `description`, `tags` (as-was, pre-substitution)      | file slots: `fileId` (live FK, `SetNull` on delete) **plus** `fileOriginalName`, `fileMimeType`, `fileSizeBytes`, `fileWidth`/`fileHeight` — copied, not re-read |
| the ordered asset-slot definitions (as-was)           | —                                                                                                                                                                |

**Not present:** `youtubeTargetId`/target identity (Template has no such field yet —
OD-36 is open) and `duration` for file slots (needs `ffprobe`, not introduced — same gap
`File.durationSeconds` has). `title` is a plain top-level `Job` column, not part of
either half, since it's the one derived value that needs no further Worker context.

### Resolved questions on snapshot shape

> **Storage form — ✅ RESOLVED (ADR-0028).** `Job.snapshot` is JSONB (the Template-level
> half only); the resolved asset values are relational `JobAsset` rows, not JSONB — a
> deliberate split from the earlier "JSONB for everything" lean, driven by Phase 6's
> explicit relational-model requirement for assets. See [../data/database.md](database.md)
> §6 and ADR-0028.

> **Retry snapshot — ✅ RESOLVED (ADR-0031).** A retry copies the original's `snapshot`
> and `JobAsset` rows verbatim — confirmed and implemented; verified end-to-end that
> editing the Template after the original Job, then retrying, still produces a Job
> matching the _original's_ configuration, not the edited one.

> **`OPEN DECISION` — do we copy the media _bytes_ for critical inputs?** The snapshot
> copies file _metadata_ always. Should it also copy the _bytes_ of input files (so a
> historical Job can still preview/re-render even after the File is purged)? _Consequence
> of copying bytes:_ true immutability, re-render always possible, but storage cost
> multiplies and undermines File hard-deletion savings. _Consequence of metadata only:_
> cheap; old Jobs show "media no longer stored" and cannot be re-rendered byte-identical.
> Recommended: **metadata only by default**; optionally pin (copy) bytes for Jobs the
> user explicitly marks "archive" — decide later.

> **`OPEN DECISION` — retry snapshot.** A retry copies the original's snapshot verbatim
> (so it renders the same inputs). Confirmed intent — but note that if input File bytes
> were already purged, an old retry may fail. Mitigation ties to the age-window decision
> in [../domain/jobs.md](../domain/jobs.md) and the "copy bytes" decision above.

## 4. Consequences for other features

| Feature              | Consequence                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template edit        | Never touches existing Jobs. Safe by construction — **implemented, Phase 5**: `updateTemplate` replaces the Template's own row/assets wholesale and touches nothing else. See [../domain/templates.md](../domain/templates.md) "Template / Job contract" and ADR-0027.                        |
| Template soft-delete | Old Jobs still render fine from the snapshot; the `templateId` FK still resolves (row kept). **Implemented, Phase 5** — soft delete never physically removes the row.                                                                                                                         |
| File hard-delete     | Old Job shows file metadata from the `JobAsset` row + "bytes no longer stored"; no error. **Implemented, Phase 4 (contract) / Phase 6 (Job side)** — see [../architecture/files.md](../architecture/files.md) "Historical integrity contract for Job/Template features" (ADR-0025, ADR-0028). |
| User disable         | Job still shows the creator's name/id; the FK resolves (User row kept).                                                                                                                                                                                                                       |
| Department archive   | Jobs remain fully readable by ADMIN.                                                                                                                                                                                                                                                          |
| Reporting            | Can trust snapshots for point-in-time accuracy (e.g. "which template config produced this").                                                                                                                                                                                                  |

## 5. Implementation checklist — done, Phase 6

- [x] Snapshot is built in the `createJob` use case (`features/jobs/use-cases/create-job.ts`),
      inside the creation transaction.
- [x] Snapshot has **no update path** — no code anywhere writes `Job.snapshot` or a
      `JobAsset` row a second time.
- [ ] The Worker fetch response is assembled from the snapshot, not live rows — **not
      applicable yet**, no Worker fetch endpoint exists (Phase 7).
- [ ] Historical Job UI reads the snapshot; it may _additionally_ show "this Template was
      since edited/deleted" as an informational badge — the detail page reads the
      snapshot correctly but does not yet render that specific badge.
- [x] File deletion is blocked outright while an active Job depends on it
      (`assertNoActiveJobDependencies`) rather than nulling a Job artifact FK — Studio has
      no Job-artifact FKs yet (no result-upload endpoint), so there is nothing to
      null/tombstone on that side; a deleted **input** File's `JobAsset.fileId` goes
      `null` via `onDelete: SetNull`, snapshot columns untouched.
- [x] Tests: editing a Template after a Job leaves the Job unchanged (verified both in
      unit tests and manually against a real database); deleting an input File is
      blocked while an active Job references it, and the Job still opens with full
      metadata once that Job completes and the File is deleted.
