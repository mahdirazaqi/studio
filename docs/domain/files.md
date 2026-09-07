# Domain: Files / File Gallery

**Implemented, Phase 4.** This page is the business rules and permission matrix;
[../architecture/files.md](../architecture/files.md) documents the mechanism (storage
adapter, upload/deletion lifecycle, the content-delivery route) and ADR-0024/0025/0026.

## Purpose

A **File** is an uploaded media asset (image / audio / video) used as an input to Jobs
and Templates, or produced as an output of a Job. The **File Gallery** is the persistent,
browsable library of reusable input assets.

---

## Part A — Legacy behavior (reference only) `LEGACY`

From `qtical-backend-node/src/render/file` (see
[../legacy/render-module-analysis.md](../legacy/render-module-analysis.md) §3.3, §7).

- Mongo collection `files`. `POST /files` (authenticated, `FILE_ADD`) + GraphQL
  `getFile` / `getFiles`.
- On upload: Multer disk storage to `./assets`, filename `Date.now()-<sanitized-name>`;
  then transcode by top-level mimetype — video/audio → `ffmpeg -i "<path>" -b:a 320k`,
  image → ImageMagick `convert`. A `File` row is created from the **converted** path.
- Fields: `_createdBy` (**declared but never actually set**), `filename`, `originalname`,
  `mimetype`, `path`, `size`.
- **No `_channel`/workspace scoping at all** — `files` is a global collection; any user
  with `FILE_VIEW` sees every file ever uploaded.
- **No soft delete, no hard delete, no delete endpoint** — and **no cleanup anywhere**.
  Originals, converted copies, per-job screenshots/thumbnails, and Telegram-downloaded
  media accumulate on disk forever.
- Job assets referenced a File **by copying `File.path` (a string) into the job at
  creation** — no foreign key, no referential integrity. Deleting/moving the file would
  silently break the job's asset path with no check.
- **Problems:** filename sanitizer only stripped non-ASCII (shell metacharacters passed
  through → command injection via `exec`); `_createdBy` never populated; `size` field
  mis-decorated; Telegram download path could produce a corrupt record with `path: ''`.

---

## Part B — Studio design

### Two categories

Every File has a `category`:

| Category        | Meaning                                                                                                                             | Deletion                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GALLERY_ASSET` | A **Persistent Gallery Asset** — intentionally kept for reuse across many Jobs/Templates.                                           | Only by explicit user action, and only when **safe** (no active/required dependency).                                 |
| `JOB_ARTIFACT`  | Produced by or attached to one specific Job (rendered video, screenshot, thumbnail, or a one-off input uploaded just for that Job). | May be **automatically physically deleted** after the owning Job reaches a completed state, per the retention design. |

### Deletion policy (ADR-0008)

- **Files are hard-deleted (row + bytes). There is no soft delete.**
- A File may be deleted only when it breaks **no active or required dependency**:
  - No `QUEUED` / `CLAIMED` / `RENDERING` Job references it as an input —
    **enforced, Phase 6** (`assertNoActiveJobDependencies`, real since Job/JobAsset
    exist; see [jobs.md](jobs.md) and ADR-0028).
  - **No Template asset currently defaults to it** — enforced, Phase 5
    (`assertNoActiveTemplateDependencies`); see [templates.md](templates.md) and
    ADR-0027.
  - It is not the sole record needed for an in-progress operation.
- **Deleting a File must never make a historical Job unreadable.** Historical Jobs do not
  depend on the File row — they hold the needed identifying metadata in their snapshot
  (ADR-0010). A deleted input File shows in the old Job as "media no longer stored", with
  its original name / type / size still visible. **Never a broken reference, never a
  crash.**
- **Job Artifact auto-cleanup:**

  > **Phase 9 status (revised ADR-0041).** `JOB_ARTIFACT` now has a real writer:
  > `features/delivery/use-cases/generate-render-artifacts.ts` creates the rendered
  > video, a screenshot, and a thumbnail as `JOB_ARTIFACT` Files on every accepted Worker
  > result (docs/domain/jobs.md "Rendered result") — `RENDERED` is the Job's final,
  > successful state, reached directly, with no delivery step after it. The
  > deletion-safety hook (`assertNoActiveJobDependencies`) is unaffected — a
  > `JOB_ARTIFACT` video is referenced only by its own Job's `videoFileId`, never a
  > `JobAsset` input, so it isn't subject to that check at all; its own dedicated cleanup
  > primitive is `features/delivery/use-cases/cleanup-job-artifacts.ts` (ADR-0039) — safe,
  > idempotent, and reference-aware (only deletes the video, only from `RENDERED`).

  > **`OPEN DECISION` — artifact retention (OD-18) — primitive built, trigger still
  > open.** The safe cleanup function above exists but is **not auto-triggered** — no
  > grace period, no scheduler (OD-40's durable-work mechanism doesn't exist yet). When
  > exactly it should run (immediately on `RENDERED` / after a retention window / on
  > storage pressure) remains undecided; screenshot + thumbnail are never deleted by this
  > function regardless.

### Gallery behavior

Users can:

- **Upload** files into their Department's gallery.
- **Browse / search / filter** their Department's gallery (ADMIN: all).
- **Preview** where applicable (image thumbnail, audio/video player).
- **Reuse** an existing file when creating a Job or defining a Template default.
- **Delete** a Persistent Gallery Asset when safe (role rules in
  [authorization.md](authorization.md)).

### Duplicate prevention

The Gallery should **avoid unnecessary duplicate uploads** when an equivalent reusable
file already exists.

> **`OPEN DECISION` — dedup mechanism & scope.** Options: content hash (e.g. SHA-256) on
> upload, matched within the Department; match on `(hash, department)` and return the
> existing File instead of storing again; or just surface "a similar file exists" without
> blocking. _Consequence of hard dedup:_ storage savings, but two users "own" one file —
> deletion/permission semantics need care. _Consequence of soft/advisory:_ simpler, minor
> duplication. Recommended: **content-hash advisory + opt-in reuse**, with hard dedup as
> a later optimization.
>
> **Phase 4 status:** `contentHash` is computed and stored on every upload, and an
> in-department match is looked up and surfaced to the uploader as a non-blocking notice
> (`duplicateOfFileId`). Nothing is blocked, merged, or offered as a "reuse this instead"
> flow yet — this OD stays open on that count.

### Fields — implemented (Phase 4; final schema: [`prisma/schema.prisma`](../../prisma/schema.prisma))

| Field              | Notes                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`               |                                                                                                                  |
| `departmentId`     | **New in Studio.** Required. Scopes visibility.                                                                  |
| `category`         | `GALLERY_ASSET` \| `JOB_ARTIFACT`. `JOB_ARTIFACT` implemented, Phase 9 (video/screenshot/thumbnail — see above). |
| `uploadedByUserId` | **Actually populated** (legacy never set it). `null` for system-generated artifacts (every `JOB_ARTIFACT`).      |
| `originalName`     | Client-supplied name, for display only.                                                                          |
| `storedName`       | **System-generated** (a UUID + extension). Never derived from user input.                                        |
| `storageKey`       | Location in the storage adapter. Never sent to the client — see architecture/files.md.                           |
| `mimeType`         | Sniffed from the real bytes (`file-type`), not the client header/extension.                                      |
| `kind`             | `IMAGE` \| `AUDIO` \| `VIDEO` — derived and validated from the sniffed type.                                     |
| `sizeBytes`        | Enforced against a per-kind max (ADR-0026).                                                                      |
| `contentHash`      | SHA-256. Advisory dedup lookup only (see above) — not yet a reuse/merge mechanism.                               |
| `width`, `height`  | Probed for `IMAGE` only (`image-size`). `null` for `AUDIO`/`VIDEO`.                                              |
| `createdAt`        |                                                                                                                  |

**Not yet implemented:** `durationSeconds` (needs `ffprobe`, still out of scope — Job
duration itself comes from the Worker's own report, `Job.durationSeconds`, not from
probing the artifact File). **No `ownerJobId` column was added** — a `JOB_ARTIFACT`'s
owning Job is found via `Job.videoFileId`/`screenshotFileId`/`thumbnailFileId` (the FK
lives on `Job`, pointing at `File`, not the other way around) since each artifact belongs
to exactly one Job and Studio already needed those columns on `Job` for the rendered
result itself (docs/domain/jobs.md "Rendered result"). Job **input** references (the opposite
direction — a `JobAsset` pointing at a Gallery File) are implemented, Phase 6 — see
"Referencing from Jobs/Templates" below.

### Upload validation

- **Implemented, Phase 4** (`features/files/domain/file-types.ts`,
  [../architecture/files.md](../architecture/files.md) "Upload lifecycle").
- Extension **and** sniffed content type must both resolve to the same allowed **kind**
  (not necessarily the exact same format — see ADR-0026) — reject on no match, with a
  clear error naming the supported types.
- Allow-list and size limits: **DECIDED, ADR-0026** — JPG/JPEG, PNG, WEBP (≤25MB); MP3
  (≤100MB); MP4 (≤500MB). Same types legacy supported; new size ceiling legacy never had.
- Store under a generated name; original name is metadata only.
- Probe dimensions for images. **Duration probing for audio/video is explicitly deferred**
  — it needs `ffprobe`, which this phase doesn't introduce; the OPEN DECISION about
  whether Studio needs any on-upload media _processing_ (legacy's ffmpeg/convert
  no-op) is unaffected and still unresolved, since Phase 4 does no transcoding either way,
  only read-only sniffing/probing of the bytes as uploaded.

### Referencing from Jobs/Templates

> **Implemented, Phase 6** (Job half) **/ Phase 5** (Template half). The exact contract —
> what to snapshot, when, and how the deletion-safety hook works — is written out in
> [../architecture/files.md](../architecture/files.md) "Historical integrity contract for
> Job/Template features" (ADR-0025, ADR-0028). The bullets below are the Phase 0 design
> intent this now implements.

- **Implemented, Phase 6:** a `JobAsset` that uses a File captures, at creation time, the
  file reference the Worker needs plus identifying metadata
  (`fileOriginalName`/`fileMimeType`/`fileSizeBytes`/`fileWidth`/`fileHeight`) — it does
  not rely on a live FK for historical readability (see
  [../data/historical-integrity.md](../data/historical-integrity.md)).
- A live FK (`JobAsset.fileId`, nullable, `onDelete: SetNull`) is kept for **active**
  dependency checks (`assertNoActiveJobDependencies`, real since Phase 6 — blocks
  deletion while a Job in `QUEUED`/`CLAIMED`/`RENDERING` still references
  the File) and for the "media still stored?" indicator. `ownerJobId` (the reverse
  direction, for a `JOB_ARTIFACT` a Job produced) was not added as a column on `File` —
  the equivalent FKs live on `Job` instead (`videoFileId`/`screenshotFileId`/
  `thumbnailFileId`, implemented Phase 9) — see "Fields" above.
- **Implemented, Phase 5:** a Template asset slot (`kind: IMAGE | AUDIO | VIDEO`) may
  store an optional **default** File reference (`TemplateAsset.defaultFileId`) —
  resolves the "template-level asset defaults" question (OD-11) as **yes**. Unlike a
  Job's snapshot, this is a live FK on a mutable resource, not a historical record: it is
  verified against the Template's own Department on every write, and a File it points to
  cannot be deleted while it does (`assertNoActiveTemplateDependencies` below). See
  [../domain/templates.md](../domain/templates.md) "File Gallery Integration" and
  [ADR-0027](../architecture/decisions.md#adr-0027--template-name-uniqueness-asset-level-file-defaults-and-the-templatefile-dependency-contract).
