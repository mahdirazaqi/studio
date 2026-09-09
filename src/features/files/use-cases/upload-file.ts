import { authorize, type Actor } from "@/server/authz";
import {
  businessRuleError,
  dependencyError,
  validationError,
} from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { storage } from "@/server/adapters/storage";
import {
  generateStorageName,
  hashContent,
  probeImageDimensions,
  sniffContentType,
} from "@/server/media/probe";
import { resolveFileKind } from "@/features/files/domain/file-types";
import type { SafeFile } from "@/features/files/domain/file";
import {
  createFile,
  findFileByContentHash,
} from "@/features/files/repository/file-repository";
import { departmentExists } from "@/features/departments/repository/department-repository";
import type { UploadFileInput } from "@/features/files/schemas/upload-file.schema";

export interface UploadFileResult {
  file: SafeFile;
  /** Set when a file with the same content already exists in the department — advisory only (OD-20), never blocking. */
  duplicateOfFileId: string | null;
}

/**
 * Upload a new Gallery Asset. Every Phase 4 upload is `category:
 * "GALLERY_ASSET"` — nothing creates a `JOB_ARTIFACT` yet (see
 * docs/domain/files.md).
 *
 * Order of operations follows docs/architecture/files.md "Upload lifecycle":
 * validate everything derivable from the bytes first (cheap, in-memory, no
 * side effects), *then* write to storage, *then* the database row — with a
 * best-effort storage cleanup if the database write fails, since a database
 * transaction cannot roll back an external object store.
 */
export async function uploadFile(
  actor: Actor,
  input: UploadFileInput,
): Promise<UploadFileResult> {
  const departmentId = await resolveTargetDepartment(actor, input.departmentId);
  authorize(actor, "file:manage", { departmentId });

  const buffer = Buffer.from(await input.file.arrayBuffer());

  const sniffed = await sniffContentType(buffer);
  if (!sniffed) {
    throw validationError(
      "This file's type could not be recognized. Supported types: JPG, PNG, WEBP images; MP3 audio; MP4 video.",
    );
  }

  const rule = resolveFileKind(sniffed.mimeType, sniffed.extension);
  if (!rule) {
    throw validationError(
      "Unsupported file type. Supported types: JPG, PNG, WEBP images; MP3 audio; MP4 video.",
    );
  }

  if (buffer.byteLength > rule.maxSizeBytes) {
    throw validationError(
      `This ${rule.kind.toLowerCase()} file is too large (max ${formatMegabytes(rule.maxSizeBytes)} MB).`,
    );
  }

  let dimensions: { width: number; height: number } | null = null;
  if (rule.kind === "IMAGE") {
    try {
      dimensions = probeImageDimensions(buffer);
    } catch (error) {
      logger.warn("Could not probe image dimensions", {
        originalName: input.file.name,
        cause: error,
      });
      throw validationError(
        "This image could not be read. It may be corrupt or use an unsupported encoding.",
      );
    }
  }

  const contentHash = hashContent(buffer);
  const duplicate = await findFileByContentHash(departmentId, contentHash);

  const { storedName, storageKey } = generateStorageName(
    departmentId,
    sniffed.extension,
  );

  try {
    await storage.put(storageKey, buffer);
  } catch (error) {
    logger.error("Storage write failed during upload", {
      storageKey,
      cause: error,
    });
    throw dependencyError(
      "Could not store the uploaded file. Please try again.",
    );
  }

  try {
    const file = await createFile({
      departmentId,
      category: "GALLERY_ASSET",
      kind: rule.kind,
      originalName: input.file.name,
      storedName,
      storageKey,
      mimeType: sniffed.mimeType,
      sizeBytes: buffer.byteLength,
      contentHash,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      uploadedByUserId: actor.userId,
    });
    return { file, duplicateOfFileId: duplicate?.id ?? null };
  } catch (error) {
    // The database is the source of truth; a row-less storage object is
    // harmless dead weight, but a DB row pointing at nothing would not be —
    // so on failure here, clean up the bytes we just wrote.
    await storage.delete(storageKey).catch((cleanupError: unknown) => {
      logger.error(
        "Failed to clean up orphaned storage object after a failed upload",
        {
          storageKey,
          cause: cleanupError,
        },
      );
    });
    logger.error("Database write failed during upload", {
      storageKey,
      cause: error,
    });
    throw error;
  }
}

async function resolveTargetDepartment(
  actor: Actor,
  requestedDepartmentId: string | undefined,
): Promise<string> {
  if (actor.role !== "ADMIN" || !requestedDepartmentId) {
    return actor.departmentId;
  }
  if (!(await departmentExists(requestedDepartmentId))) {
    throw businessRuleError("The selected department does not exist.");
  }
  return requestedDepartmentId;
}

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}
