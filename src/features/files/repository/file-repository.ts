import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { departmentScopeFilter, type Actor } from "@/server/authz";
import type { Paginated } from "@/types";
import type {
  FileCategory,
  FileKind,
  SafeFile,
} from "@/features/files/domain/file";

/**
 * The only module that queries the `File` table. Every read here applies
 * `departmentScopeFilter(actor)` (docs/architecture/authorization.md) — there
 * is no "list everything" query available to callers above this layer.
 */

const SAFE_FILE_SELECT = {
  id: true,
  departmentId: true,
  category: true,
  kind: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  uploadedByUserId: true,
  uploadedBy: { select: { fullName: true } },
  createdAt: true,
} as const;

type SafeFileRow = Prisma.FileGetPayload<{ select: typeof SAFE_FILE_SELECT }>;

function toSafeFile(row: SafeFileRow): SafeFile {
  return {
    id: row.id,
    departmentId: row.departmentId,
    category: row.category,
    kind: row.kind,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    uploadedByUserId: row.uploadedByUserId,
    uploadedByName: row.uploadedBy?.fullName ?? null,
    createdAt: row.createdAt,
  };
}

export interface CreateFileData {
  departmentId: string;
  category: FileCategory;
  kind: FileKind;
  originalName: string;
  storedName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  width: number | null;
  height: number | null;
  uploadedByUserId: string | null;
}

export async function createFile(data: CreateFileData): Promise<SafeFile> {
  const row = await db.file.create({ data, select: SAFE_FILE_SELECT });
  return toSafeFile(row);
}

/**
 * Load a file the actor is allowed to see, or `null` for both "doesn't exist"
 * and "exists in another department" — the department scope is folded
 * directly into the query so both cases are indistinguishable, per
 * docs/development/authorization.md's preferred pattern.
 */
export async function findFileInScope(
  actor: Actor,
  fileId: string,
): Promise<SafeFile | null> {
  const row = await db.file.findFirst({
    where: { id: fileId, ...departmentScopeFilter(actor) },
    select: SAFE_FILE_SELECT,
  });
  return row ? toSafeFile(row) : null;
}

/** Only for the delete use case's storage cleanup — never returned to a client. */
export async function findStorageKey(fileId: string): Promise<string | null> {
  const row = await db.file.findUnique({
    where: { id: fileId },
    select: { storageKey: true },
  });
  return row?.storageKey ?? null;
}

export interface FileForServing {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
}

/**
 * Department-scoped, like `findFileInScope`, but selects `storageKey` — the
 * one legitimate server-side reason to read it. Only the `/api/files/[fileId]`
 * route (via `getFileForServing`) calls this; nothing sends its result to a
 * client as-is.
 */
export async function findFileForServing(
  actor: Actor,
  fileId: string,
): Promise<FileForServing | null> {
  return db.file.findFirst({
    where: { id: fileId, ...departmentScopeFilter(actor) },
    select: {
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
    },
  });
}

/**
 * Worker-facing, unscoped — no department filter (Phase 7,
 * docs/architecture/files.md "Access & preview: Worker access"). The Worker
 * only ever learns a `fileId` from its own Job payload
 * (`buildWorkerJobPayload`), which is itself built from a Job's immutable,
 * already-validated `JobAsset` rows — by the time a Worker requests bytes
 * here, the id is not a value it picked freely, it is one Studio already
 * resolved and handed to it. Route-level `authenticateWorker` is the actual
 * gate; this function does not re-check anything beyond "does this id exist."
 */
export async function findFileForWorkerServing(
  fileId: string,
): Promise<FileForServing | null> {
  return db.file.findUnique({
    where: { id: fileId },
    select: {
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
    },
  });
}

export interface ListFilesFilters {
  category: FileCategory;
  kind?: FileKind;
  q?: string;
  /**
   * Narrows further within `departmentScopeFilter(actor)`'s own result —
   * **only ever honored for ADMIN.** For a non-ADMIN actor,
   * `departmentScopeFilter` already forces `departmentId: actor.departmentId`
   * ahead of this in the spread below, so a non-ADMIN-supplied value here can
   * never widen or redirect their scope; only ADMIN's `{}` scope leaves room
   * for this to apply. Lets the Job asset File Picker narrow ADMIN's
   * cross-department browse down to one Template's department without a
   * second, parallel query path.
   */
  departmentId?: string;
  page: number;
  pageSize: number;
}

export async function listFiles(
  actor: Actor,
  filters: ListFilesFilters,
): Promise<Paginated<SafeFile>> {
  const where = {
    ...departmentScopeFilter(actor),
    ...(actor.role === "ADMIN" && filters.departmentId
      ? { departmentId: filters.departmentId }
      : {}),
    category: filters.category,
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.q
      ? { originalName: { contains: filters.q, mode: "insensitive" as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.file.findMany({
      where,
      select: SAFE_FILE_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.file.count({ where }),
  ]);

  return {
    items: rows.map(toSafeFile),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
}

/** Advisory dedup lookup (OD-20) — the caller decides what, if anything, to do with a match. */
export async function findFileByContentHash(
  departmentId: string,
  contentHash: string,
): Promise<SafeFile | null> {
  const row = await db.file.findFirst({
    where: { departmentId, contentHash, category: "GALLERY_ASSET" },
    select: SAFE_FILE_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return row ? toSafeFile(row) : null;
}

export async function deleteFileRow(fileId: string): Promise<void> {
  await db.file.delete({ where: { id: fileId } });
}

/**
 * Which of `fileIds` are real, department-scoped Gallery Assets. Used by the
 * Templates feature (`features/templates/use-cases/verify-file-references.ts`)
 * to validate every `defaultFileId` an asset submits belongs to the
 * Template's own Department — never the actor's, since ADMIN may create a
 * Template for a department other than their own (docs/domain/templates.md
 * "File Gallery Integration"). Returns a `Set` rather than the rows
 * themselves: the caller only needs "does this id resolve here", not the
 * File's other fields.
 */
export async function findGalleryFileIdsInDepartment(
  departmentId: string,
  fileIds: readonly string[],
): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const rows = await db.file.findMany({
    where: {
      id: { in: [...fileIds] },
      departmentId,
      category: "GALLERY_ASSET",
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

/**
 * The full-metadata counterpart to `findGalleryFileIdsInDepartment` — used by
 * `features/jobs/use-cases/resolve-job-assets.ts` (Phase 6) to copy each
 * referenced File's identifying metadata onto its `JobAsset` row at creation
 * time (ADR-0025/0028's historical-integrity contract). Same department
 * scoping and `GALLERY_ASSET`-only restriction as the id-only version.
 */
export async function findGalleryFilesByIdsInDepartment(
  departmentId: string,
  fileIds: readonly string[],
): Promise<SafeFile[]> {
  if (fileIds.length === 0) return [];
  const rows = await db.file.findMany({
    where: {
      id: { in: [...fileIds] },
      departmentId,
      category: "GALLERY_ASSET",
    },
    select: SAFE_FILE_SELECT,
  });
  return rows.map(toSafeFile);
}
