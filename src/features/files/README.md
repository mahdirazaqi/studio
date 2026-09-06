# feature: files

**Scope:** the File Gallery — upload, catalog, browse, preview, reuse, and safe deletion
of media assets.

**Status: implemented (Phase 4; extended Phase 5 and Phase 7).** See
[`docs/architecture/files.md`](../../../docs/architecture/files.md) for the mechanism and
ADR-0024/0025/0026/0027, and [`docs/domain/files.md`](../../../docs/domain/files.md) for
the business rules.

## Contents

- `domain/file.ts` — `SafeFile` (the client-safe shape — no `storageKey`), `FileCategory`.
- `domain/file-types.ts` — the allow-list + per-kind size limits + `resolveFileKind()`.
  Pure. Centralize any future type/limit change here, not in a form or action.
- `schemas/` — `uploadFileSchema`, `listFilesSchema`.
- `repository/file-repository.ts` — the only module querying the `File` table. Every read
  applies `departmentScopeFilter(actor)`.
- `use-cases/`
  - `upload-file.ts` — validation → storage write → DB write, with orphan cleanup on a
    failed DB write.
  - `list-files.ts`, `get-file.ts` — department-scoped reads.
  - `list-all-gallery-files-for-admin.ts` (Phase 5) — ADMIN-only, cross-department,
    capped listing for the Template asset editor's "default file" picker when ADMIN
    authors a Template for a department other than their own.
  - `get-file-for-serving.ts` — the one place `storageKey` is read for an actual byte
    read; only `/api/files/[fileId]` calls it (session-authenticated path).
  - `get-file-for-worker-serving.ts` (Phase 7) — the Worker-authenticated equivalent:
    no `Actor`, unscoped by department (via `findFileForWorkerServing`), for the same
    shared-credential trust model as `jobs/repository`'s `findJobById`. Also only
    `/api/files/[fileId]` calls it.
  - `delete-file.ts` — DB row deleted before storage bytes.
  - `authorize-file-management.ts` — `assertCanDeleteFile` / `canDeleteFile` (a USER may
    delete only their own upload), `assertNoActiveJobDependencies` (still a documented
    no-op — the Jobs feature's extension point, ADR-0025), and
    `assertNoActiveTemplateDependencies` (real, Phase 5 — blocks deleting a File any
    Template asset currently defaults to, ADR-0027).
- `actions/` — `uploadFileAction`, `deleteFileAction`.
- `components/` — `UploadFileForm`, `FilesToolbar` (search/kind filter, URL-driven),
  `FileCard`, `DeleteFileButton`.

The storage adapter (`@/server/adapters/storage`) and media probing
(`@/server/media`) live outside this feature, as generic `server/*` infrastructure — see
`docs/architecture/files.md`.

**Not built yet:** `ownerJobId` and real `JOB_ARTIFACT` creation (the reverse direction —
a Job _producing_ a File — needs a result-upload endpoint, still not built in Phase 7), a
dedup/reuse UI (OD-20 stays open), audio/video duration probing (needs `ffprobe`),
scheduled artifact cleanup. Templates (Phase 5) and Jobs (Phase 6, the input direction —
see `features/jobs/README.md`) already reference Files; the Worker (Phase 7) downloads
input Files through the same `/api/files/[fileId]` route, authenticated with its shared
credential instead of a session.
