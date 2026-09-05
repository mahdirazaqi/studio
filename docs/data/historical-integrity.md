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

## 3. The snapshot (ADR-0010)

At Job creation, Studio writes an **immutable** snapshot onto the Job. It is written once
and **never updated**. It is also what the Worker fetch response is built from.

### Snapshot must contain (minimum)

| From Template                                                                             | From resolved assets                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templateId` + `templateName` (as-was)                                                    | For each slot: `slotName`, `kind`, `composition`, `layer`                                                                                                                    |
| `composition`, `source`, `outputPattern`, `scriptRef`                                     | `DATA` slots: the literal `text`                                                                                                                                             |
| `description`, `tags` (as-was, pre-substitution)                                          | file slots: the file reference/path the Worker uses **plus** `originalName`, `mimeType`, `sizeBytes`, `width/height/duration`, and the source `fileId` (if from the gallery) |
| the ordered asset-slot definitions (as-was)                                               | the computed `title`                                                                                                                                                         |
| `youtubeTargetId` (as-was) + enough target identity to explain "where it was meant to go" |                                                                                                                                                                              |

### Open questions on snapshot shape

> **`OPEN DECISION` — storage form.** JSONB column on `jobs` vs. a dedicated
> `job_snapshot` 1:1 table vs. denormalized columns + a JSON blob for the flexible parts.
> _Consequence of JSONB:_ simplest, naturally immutable, easy to serve to the Worker;
> harder to query/aggregate across jobs. _Consequence of columns:_ queryable; more schema
> churn. Recommended: **JSONB `snapshot` column**, plus a few denormalized top-level
> columns (`title`, `templateId`, timeline) for indexing/filtering.

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

| Feature              | Consequence                                                                                                                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template edit        | Never touches existing Jobs. Safe by construction — **implemented, Phase 5**: `updateTemplate` replaces the Template's own row/assets wholesale and touches nothing else. See [../domain/templates.md](../domain/templates.md) "Template / Job contract" and ADR-0027.                                                           |
| Template soft-delete | Old Jobs still render fine from the snapshot; the `templateId` FK still resolves (row kept). **Implemented, Phase 5** — soft delete never physically removes the row.                                                                                                                                                            |
| File hard-delete     | Old Job shows file metadata from the snapshot + "bytes no longer stored"; no error. **Implemented, Phase 4** — see [../architecture/files.md](../architecture/files.md) "Historical integrity contract for future Job/Template features" (ADR-0025) for the exact contract a Job/Template feature must follow to keep this true. |
| User disable         | Job still shows the creator's name/id; the FK resolves (User row kept).                                                                                                                                                                                                                                                          |
| Department archive   | Jobs remain fully readable by ADMIN.                                                                                                                                                                                                                                                                                             |
| Reporting            | Can trust snapshots for point-in-time accuracy (e.g. "which template config produced this").                                                                                                                                                                                                                                     |

## 5. Implementation checklist (for Phase 1)

- [ ] Snapshot is built in the `createJob` use case, inside the creation transaction.
- [ ] Snapshot is `readonly` in code and has **no update path**.
- [ ] The Worker fetch response is assembled from the snapshot, not live rows.
- [ ] Historical Job UI reads the snapshot; it may _additionally_ show "this Template was
      since edited/deleted" as an informational badge.
- [ ] File deletion updates the Job's artifact FKs to null/tombstone but leaves the
      snapshot untouched.
- [ ] Tests: edit a Template after a Job, assert the Job is unchanged; delete an input
      File, assert the Job still opens with metadata.
