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
  - No `QUEUED` / `CLAIMED` / `RENDERING` / `DELIVERING` Job references it as an input.
  - It is not the sole record needed for an in-progress operation.
- **Deleting a File must never make a historical Job unreadable.** Historical Jobs do not
  depend on the File row — they hold the needed identifying metadata in their snapshot
  (ADR-0010). A deleted input File shows in the old Job as "media no longer stored", with
  its original name / type / size still visible. **Never a broken reference, never a
  crash.**
- **Job Artifact auto-cleanup:**

  > **Phase 4 status.** `category` exists in the schema (`GALLERY_ASSET` |
  > `JOB_ARTIFACT`) and every current code path only ever creates `GALLERY_ASSET` — there
  > is no Job feature yet to produce an artifact. The deletion-safety hook a future Job
  > feature must fill in (`assertNoActiveJobDependencies`) is documented and unit-tested
  > as a no-op in [../architecture/files.md](../architecture/files.md) (ADR-0025).

  > **`OPEN DECISION` — artifact retention.** When exactly are `JOB_ARTIFACT` files
  > deleted? Options: immediately on `UPLOADED`; after a retention window (e.g. 30 days);
  > keep the thumbnail forever but purge the full video after delivery; keep everything
  > until storage pressure. Also: does successful YouTube delivery make the local video
  > redundant? _Consequence of aggressive cleanup:_ low storage cost, but re-delivery /
  > debugging a past render is impossible. _Consequence of long retention:_ storage
  > grows. Recommended starting point: **purge the full rendered video after successful
  > required delivery + a short grace window; keep screenshot + thumbnail longer;** exact
  > windows configurable.

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

| Field              | Notes                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `id`               |                                                                                        |
| `departmentId`     | **New in Studio.** Required. Scopes visibility.                                        |
| `category`         | `GALLERY_ASSET` \| `JOB_ARTIFACT`. Only `GALLERY_ASSET` is ever created so far.        |
| `uploadedByUserId` | **Actually populated** (legacy never set it). Null for system-generated artifacts.     |
| `originalName`     | Client-supplied name, for display only.                                                |
| `storedName`       | **System-generated** (a UUID + extension). Never derived from user input.              |
| `storageKey`       | Location in the storage adapter. Never sent to the client — see architecture/files.md. |
| `mimeType`         | Sniffed from the real bytes (`file-type`), not the client header/extension.            |
| `kind`             | `IMAGE` \| `AUDIO` \| `VIDEO` — derived and validated from the sniffed type.           |
| `sizeBytes`        | Enforced against a per-kind max (ADR-0026).                                            |
| `contentHash`      | SHA-256. Advisory dedup lookup only (see above) — not yet a reuse/merge mechanism.     |
| `width`, `height`  | Probed for `IMAGE` only (`image-size`). `null` for `AUDIO`/`VIDEO`.                    |
| `createdAt`        |                                                                                        |

**Not yet implemented:** `durationSeconds` (needs `ffprobe`, out of Phase 4's scope — see
"Upload validation" below) and `ownerJobId` (no Job model exists to reference; added when
the Jobs feature lands, per ADR-0025's contract in
[../architecture/files.md](../architecture/files.md)).

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

> **Phase 4 note:** the exact contract a future Job/Template feature must follow — what
> to snapshot, when, and how the deletion-safety hook works — is written out in
> [../architecture/files.md](../architecture/files.md) "Historical integrity contract for
> future Job/Template features" (ADR-0025). The bullets below are the Phase 0 design
> intent this now makes concrete.

- A Job asset that uses a File captures, at creation time, the **file reference the
  Worker needs plus identifying metadata** — it does not rely on a live FK for historical
  readability (see [../data/historical-integrity.md](../data/historical-integrity.md)).
- A live FK (`ownerJobId`, and Job-asset → File) is still kept for **active** dependency
  checks (so deletion can be blocked while a Job is in flight) and for the "media still
  stored?" indicator.
- Templates may store **default** File references for slots (optional feature — OPEN
  DECISION whether Studio supports template-level asset defaults).
