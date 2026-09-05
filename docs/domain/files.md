# Domain: Files / File Gallery

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

### Fields (conceptual — final schema in [../data/database.md](../data/database.md))

| Field                                | Notes                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `id`                                 |                                                                                    |
| `departmentId`                       | **New in Studio.** Required. Scopes visibility.                                    |
| `category`                           | `GALLERY_ASSET` \| `JOB_ARTIFACT`.                                                 |
| `uploadedByUserId`                   | **Actually populated** (legacy never set it). Null for system-generated artifacts. |
| `originalName`                       | Client-supplied name, for display only.                                            |
| `storedName`                         | **System-generated** (e.g. a UUID + extension). Never derived from user input.     |
| `storageKey`                         | Location in the storage adapter.                                                   |
| `mimeType`                           | Validated against real content sniffing, not just the client header/extension.     |
| `kind`                               | `IMAGE` \| `AUDIO` \| `VIDEO` — derived and validated.                             |
| `sizeBytes`                          | Enforced against a max (OPEN DECISION on limits).                                  |
| `contentHash`                        | For dedup / integrity.                                                             |
| `width`, `height`, `durationSeconds` | Probed metadata where applicable (drives aspect-ratio checks).                     |
| `ownerJobId`                         | For `JOB_ARTIFACT` — the Job it belongs to.                                        |
| `createdAt`                          |                                                                                    |

### Upload validation

- Extension **and** sniffed content type must both be in the allowed set.
  > **`OPEN DECISION` — allowed types & size limits.** Legacy allowed
  > `jpg/jpeg/png/webp/mp4/mp3` for general upload and `.mp4` only for job results.
  > Confirm the Studio allow-list and per-kind max sizes.
- Reject on mismatch with a clear error.
- Store under a generated name; original name is metadata only.
- Probe dimensions/duration for later validation.
- If Studio normalizes on upload (legacy's ffmpeg/convert step), it must use `execFile`
  with an argument array (ADR-0015). Whether normalization is even needed is an
  **OPEN DECISION** — legacy's intent for the `convert` no-op is unknown.

### Referencing from Jobs/Templates

- A Job asset that uses a File captures, at creation time, the **file reference the
  Worker needs plus identifying metadata** — it does not rely on a live FK for historical
  readability (see [../data/historical-integrity.md](../data/historical-integrity.md)).
- A live FK (`ownerJobId`, and Job-asset → File) is still kept for **active** dependency
  checks (so deletion can be blocked while a Job is in flight) and for the "media still
  stored?" indicator.
- Templates may store **default** File references for slots (optional feature — OPEN
  DECISION whether Studio supports template-level asset defaults).
