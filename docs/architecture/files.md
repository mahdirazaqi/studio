# Files — Architecture

**`DECIDED` — implemented in Phase 4.** ADR-0008 (deletion policy), ADR-0024 (storage
abstraction), ADR-0025 (deletion contract / historical integrity), ADR-0026 (allow-list &
size limits). Business rules and the permission matrix live in
[../domain/files.md](../domain/files.md) — this page is the mechanism.

**Phase 5 update:** the Template→File dependency this page's "Historical integrity
contract" section anticipated is now real, not just documented — see
`assertNoActiveTemplateDependencies` below and
[../domain/templates.md](../domain/templates.md) "Template → File dependency" /
ADR-0027.

**Phase 6 update:** the Job→File dependency is now real too —
`assertNoActiveJobDependencies` is no longer a no-op; see
`countActiveJobAssetReferencesToFile` below and
[../domain/jobs.md](../domain/jobs.md) / ADR-0028.

## Layout

```
src/features/files/
├── domain/
│   ├── file.ts          SafeFile, FileCategory — the client-safe shape (no storageKey)
│   └── file-types.ts     allow-list + per-kind size limits + resolveFileKind() — pure
├── schemas/               upload-file.schema.ts, list-files.schema.ts
├── repository/            file-repository.ts — the only module querying the File table
├── use-cases/
│   ├── upload-file.ts
│   ├── list-files.ts
│   ├── get-file.ts                 metadata read (detail views)
│   ├── get-file-for-serving.ts     storageKey read — only for the content route
│   ├── delete-file.ts
│   └── authorize-file-management.ts   assertCanDeleteFile, canDeleteFile,
│                                       assertNoActiveJobDependencies (real,
│                                       Phase 6 — ADR-0028), and
│                                       assertNoActiveTemplateDependencies (real,
│                                       Phase 5 — ADR-0027)
├── actions/               upload-file.action.ts, delete-file.action.ts
└── components/            UploadFileForm, FilesToolbar, FileCard, DeleteFileButton

src/server/adapters/storage/   StorageAdapter interface + LocalStorageAdapter (ADR-0024)
src/server/media/probe.ts       sniffContentType, probeImageDimensions, hashContent
src/app/api/files/[fileId]/[[...rest]]/route.ts   authenticated binary content delivery
                                                    (trailing [[...rest]] is an ignored
                                                    filename hint, ADR-0044 — see below)
```

## Storage abstraction

See ADR-0024. `@/server/adapters/storage` exports `storage: StorageAdapter` — `put`,
`delete`, `stat`, `readStream(key, range?)`. Nothing outside this module imports `node:fs`
or a cloud SDK for file bytes. The only implementation today is `LocalStorageAdapter`,
writing under `env.STORAGE_LOCAL_DIR` (default `.data/storage`, outside `public/`).

`storageKey` (e.g. `{departmentId}/{uuid}.{ext}`) is generated once, at upload time, and
is opaque to everything above the repository layer — `SafeFile` (the type returned to
Server Components/Actions) does not carry it. Only `get-file-for-serving.ts` reads it, for
the one legitimate reason: the content route needs it to call `storage.readStream`.

`storedName`/`storageKey` generation itself is centralized in one function,
`generateStorageName(departmentId, extension)` (`@/server/media/probe.ts`, ADR-0046) —
never inlined at a call site. It never takes `originalName`: `randomUUID()` is the only
source of uniqueness, so nothing about the client-supplied name (spaces, Unicode,
punctuation, length) needs sanitizing to become Worker/filesystem-safe, and
`extension` must already be the one `resolveFileKind` validated against the sniffed
bytes, never the client's declared one. Both `upload-file.ts` (Gallery uploads) and
`create-job-artifact.ts` (Worker render-result artifacts) call this same function.
It lives in `@/server/media` rather than the isomorphic
`features/files/domain/file-types.ts` because that module is also imported by the
Client Component `file-picker.tsx`, which can never pull in `node:crypto`.

## Upload lifecycle

`features/files/use-cases/upload-file.ts`, in order:

1. **Resolve the target department.** USER/MANAGER: always their own
   (`actor.departmentId`) — a client-supplied `departmentId` is ignored. ADMIN: may supply
   one explicitly (docs/domain/authorization.md — "Upload file: ... Into own department
   (ADMIN: any)"); it's validated to exist first.
2. **Authorize** (`authorize(actor, "file:manage", { departmentId })`).
3. **Sniff the real content type** from the bytes (`@/server/media`'s `sniffContentType`,
   backed by `file-type`) — the client's declared `File.type` is never trusted.
4. **Resolve the kind** (`resolveFileKind`) against the allow-list (ADR-0026). No match →
   `validation` error naming the supported types.
5. **Check the per-kind size limit.** A JPEG under the video cap but over the image cap is
   still rejected — the limit is chosen by the sniffed kind, not the declared one.
6. **Probe dimensions** for `IMAGE` only (`image-size`, pure JS, no subprocess). A file
   that sniffs as an image but fails to decode (corrupt/truncated) is rejected as a
   validation error, not allowed through with `width`/`height` left blank.
7. **Hash the content** (SHA-256) and look up an existing file with the same hash in the
   same department — **advisory only** (OD-20 stays open): if found, upload still
   proceeds, and the result carries `duplicateOfFileId` for the UI to show a non-blocking
   toast. Nothing is blocked or silently merged.
8. **Write to storage**, then **write the database row**. If the storage write fails,
   nothing else happens (no orphan, no row). If the _database_ write fails after a
   successful storage write, the use case deletes the just-written storage object
   (best-effort; a failure to clean up is logged, not thrown) — a database transaction
   cannot roll back an external object store, so this compensation step is the only
   defense against an orphaned object.

Every step before the storage write operates on the in-memory buffer only — cheap to
reject early, and nothing is written anywhere until validation fully passes.

## Deletion

`features/files/use-cases/delete-file.ts` — see ADR-0025 for the full reasoning:

1. Load the file **scoped to the actor's department** (`findFileInScope` — cross-department
   and nonexistent both resolve to the same `not_found`).
2. `assertCanDeleteFile` — role floor + department match (`authorize`) plus: a USER may
   delete only their own upload; MANAGER/ADMIN may delete any file in scope.
3. `assertNoActiveJobDependencies` (Phase 6, ADR-0028) — a **real** check: counts every
   `JobAsset` row referencing this File whose `Job` is in an active state
   (`QUEUED`/`CLAIMED`/`RENDERING`), and throws `conflict` if any exist. A
   Job that has already reached a terminal state never blocks deletion — its `JobAsset`
   rows already carry the copied metadata a historical view needs.
4. `assertNoActiveTemplateDependencies` (Phase 5, ADR-0027) — a **real** check: counts
   every `TemplateAsset` row (of any Template, deleted or not) whose `defaultFileId`
   points at this File, and throws `conflict` if any exist. Not scoped to non-deleted
   Templates only — `TemplateAsset.defaultFileId`'s `onDelete: Restrict` FK is enforced
   regardless of the referencing Template's soft-delete state, so this check must refuse
   in exactly the same cases the FK would, or a caller could still hit a raw Postgres
   foreign-key error after being told "safe to delete."
5. Delete the **database row first**, then the **storage bytes**. If the storage delete
   fails, the row is already gone — the result is a harmless orphaned object (logged),
   never a row pointing at missing bytes.

## Access & preview

Every file URL the browser ever sees is `/api/files/[fileId]` — the File's database id,
never its storage key. That route:

- Is a **plain Route Handler**, not `defineRouteHandler` (`@/server/api`) — that helper
  always returns JSON; binary streaming with byte-range support needs a raw `Response`.
- Is **not** a REST-for-internal-features exception in the sense
  [boundaries.md](boundaries.md) warns against — it carries no business logic, only an
  authenticated read-and-stream. A browser `<img>`/`<audio>`/`<video>` tag fetches its
  `src` as a plain GET; there is no Server Component/Action equivalent for that. See
  [boundaries.md](boundaries.md)'s decision table for the explicit, narrow carve-out.
- **Re-authenticates and re-authorizes on every request.** There is no signed or
  cacheable URL — `Cache-Control: private, no-store`. A cross-department or unknown id
  both resolve to `404`, and no session resolves to `401`.
- **Supports a single `Range: bytes=start-end` request** (`206 Partial Content` /
  `416 Range Not Satisfiable`), enough for audio/video seeking. No multi-range support.
- **Accepts an optional trailing filename segment, ignored for lookup — ADR-0044.**
  `/api/files/[fileId]/[[...rest]]`: `fileId` alone always resolves the File; `rest`
  (present or not) never affects it. Exists because the real Render Worker's
  downloader (`navaak-ae-renderer/renderer/operator/downloader.go`) names its local
  temp copy after a downloaded URL's **last path segment** — a bare `/api/files/{id}`
  has no extension, so every asset/Template it downloaded was saved locally with none,
  breaking anything downstream that infers file type from the extension. The Worker's
  claim/get-by-id payload now appends the File's own original filename as this extra
  segment (`buildFileUrlFromRequest`, `worker-job-payload.ts`) purely so the Worker's
  local copy gets a real one — every other caller (the dashboard, `FileCard`, etc.)
  never sends this segment and is completely unaffected. The segment is never
  percent-encoded (**ADR-0047**, correcting ADR-0044's original implementation) — the
  Worker's own `net/url` encodes it exactly once when building its request; encoding it
  here first produced a real double-encoding bug (`%20` → `%2520`) confirmed against an
  actual Worker run. Only `/`, `\`, `..`, and the characters illegal in a Windows
  filename (`<>:"|?*` + control characters — the real deployment runs the renderer on
  Windows) are neutralized; everything else, including spaces and Unicode, reaches the
  Worker exactly as typed.
- **Sends a `Content-Disposition` header carrying the File's `originalName` —
  ADR-0046.** `inline; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded
originalName>` on every response — the same extension-loss failure mode ADR-0044
  fixed for the Worker's downloader, but on the browser side: the URL itself is
  deliberately extension-less (identity is the id, not a path), so without this header
  a direct "Save As"/navigation download falls back to the bare id with no extension.
  `inline` keeps every existing `<img>`/`<audio>`/`<video>` embed rendering exactly as
  before — only the filename a save proposes changes. Always `originalName`, never
  `storedName`/`storageKey` (those stay internal, per "Storage abstraction" above).

## Historical integrity contract for Job/Template features

This is the one Phase 4 decision every later feature that references a File must honor —
see ADR-0025 and [../data/historical-integrity.md](../data/historical-integrity.md).
**Templates (Phase 5) and Jobs (Phase 6) are both real consumers now.**

- **Never hold a live File row as the only source of truth for a historical record.**
  This governs **Job** (`JobAsset`, ADR-0028), which copies the fields it needs
  (`fileOriginalName`, `fileMimeType`, `fileSizeBytes`, `fileWidth`/`fileHeight`) into its
  own immutable row at creation time, alongside a live `fileId` FK for the "media still
  stored?" check. It does **not** govern a Template's `defaultFileId` — that is a live,
  current-configuration field on a mutable resource, not a historical record, so it is
  correctly a plain FK with no snapshot of its own (ADR-0027).
- **Before deleting a File, the deleting feature is responsible for its own active-
  dependency check.** For Files today that's two checks, both called from `deleteFile`:
  `assertNoActiveJobDependencies` (real, Phase 6, ADR-0028 — counts active-state
  `JobAsset` references, not a parallel check elsewhere) and
  `assertNoActiveTemplateDependencies` (real, Phase 5 — see "Deletion" above).
  `File.category = JOB_ARTIFACT` now has a real writer (Phase 9,
  `features/delivery/use-cases/generate-render-artifacts.ts`). It has its own dedicated
  deletion path instead — `features/delivery/use-cases/cleanup-job-artifacts.ts`, which
  checks Job-state/delivery-outcome invariants the ordinary `file:manage` capability has
  no way to express. `assertCanDeleteFile` explicitly refuses `category: "JOB_ARTIFACT"`
  for every role, including ADMIN (a real check, not a UI omission — CLAUDE.md "a hidden
  button is not authorization" cuts both ways) — the ordinary Gallery delete action can
  never remove one, by construction.
- **A deleted File must never surface as a broken link or a crash** in a historical
  view — the UI reads the snapshot and shows "media no longer stored" (with the
  snapshot's name/type/size still intact) when the live File is gone, exactly like
  [../data/lifecycle-rules.md](../data/lifecycle-rules.md) describes. This is unaffected
  by Templates: a Template's File dependency is handled by _preventing_ the delete in the
  first place (above), not by tolerating a dangling reference afterward.

## What Phase 4 deliberately does not do

- **No duration probing for audio/video** (`durationSeconds` isn't a column yet) — that
  needs `ffprobe`, which this phase doesn't introduce (out of scope; see
  [../domain/files.md](../domain/files.md)). Image dimensions are cheap and pure-JS, so
  those are probed.
- **No hard/blocking dedup, no "reuse this file?" UI** — OD-20 stays open; only the
  groundwork (`contentHash` stored and indexed, an advisory toast) exists.
- **No scheduled cleanup job** (unchanged through Phase 9). `cleanupJobArtifacts` is a
  real, tested, safe primitive now, but nothing calls it automatically — OD-18's
  grace-period/trigger question stays open (OD-40's durable-work mechanism doesn't exist
  yet to hang a sweep on).
- **No Dialog/AlertDialog primitive was added** for the delete confirmation — a native
  `window.confirm()` is used instead, a deliberate simplification given this phase's
  focus is the File domain/backend, not polished modal UX. Revisit if/when a design
  system pass touches destructive-action confirmations generally.
