# feature: files

**Scope:** the File Gallery — upload, catalog, browse, preview, reuse, and safe deletion
of media assets.

**Key rules** (`docs/domain/files.md`, ADR-0008):

- Every File is a `GALLERY_ASSET` (kept until explicitly deleted, when safe) or a
  `JOB_ARTIFACT` (auto-purged after its Job completes, per retention policy).
- Files are **hard-deleted when safe** (no soft delete). Deletion must never make a
  historical Job unreadable — Jobs keep file metadata in their snapshot.
- Uploads validated by **content type + size**; stored under a **system-generated name**
  (never user input). No `exec` string shell-outs for any media processing (ADR-0015).

**Not built yet.** Depends on the database layer and the storage adapter (OPEN DECISION
OD-42).

Will contain: `domain/` (File type, category), `use-cases/` (upload, delete-if-safe,
purge-artifacts), `actions/`, `schemas/`, `repository/`, `read/`, `components/`, and
`server/` (storage-adapter usage, media probing via `execFile`).
