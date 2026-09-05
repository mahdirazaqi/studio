# feature: files

**Scope:** the File Gallery — upload, catalog, browse, preview, reuse, and safe deletion
of media assets.

**Status: implemented (Phase 4).** See
[`docs/architecture/files.md`](../../../docs/architecture/files.md) for the mechanism and
ADR-0024/0025/0026, and [`docs/domain/files.md`](../../../docs/domain/files.md) for the
business rules.

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
  - `get-file-for-serving.ts` — the one place `storageKey` is read for an actual byte
    read; only `/api/files/[fileId]` calls it.
  - `delete-file.ts` — DB row deleted before storage bytes.
  - `authorize-file-management.ts` — `assertCanDeleteFile` / `canDeleteFile` (a USER may
    delete only their own upload) and `assertNoActiveJobDependencies` (a documented
    no-op today — the Jobs feature's extension point, ADR-0025).
- `actions/` — `uploadFileAction`, `deleteFileAction`.
- `components/` — `UploadFileForm`, `FilesToolbar` (search/kind filter, URL-driven),
  `FileCard`, `DeleteFileButton`.

The storage adapter (`@/server/adapters/storage`) and media probing
(`@/server/media`) live outside this feature, as generic `server/*` infrastructure — see
`docs/architecture/files.md`.

**Not built yet:** the Templates/Jobs features that will actually reference a File
(`ownerJobId`, real `JOB_ARTIFACT` creation, the real active-dependency check), a
dedup/reuse UI (OD-20 stays open), audio/video duration probing (needs `ffprobe`),
scheduled artifact cleanup.
