import { randomUUID } from "node:crypto";

import { dependencyError, validationError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { storage } from "@/server/adapters/storage";
import {
  hashContent,
  probeImageDimensions,
  sniffContentType,
} from "@/server/media/probe";
import { resolveFileKind } from "@/features/files/domain/file-types";
import type { SafeFile } from "@/features/files/domain/file";
import { createFile } from "@/features/files/repository/file-repository";

/**
 * Register a system-generated Job artifact (rendered video, screenshot,
 * thumbnail) as a `category: JOB_ARTIFACT` File (docs/domain/files.md, Phase
 * 9, ADR-0039). Deliberately **not** `uploadFile`: there is no `Actor` here
 * (the Worker is never one — docs/domain/jobs.md "Worker identity"), no
 * Gallery duplicate-detection (an artifact is never a candidate for reuse),
 * and `uploadedByUserId` is always `null` (the File model's own "system-
 * generated artifact" case). The byte-level rules Files owns — real
 * content-type sniffing, the allow-list, per-kind size limits
 * (`features/files/domain/file-types.ts`, ADR-0026) — are reused unmodified;
 * this is not a second, looser validation path for artifact bytes.
 *
 * Only `features/delivery/use-cases/accept-job-result.ts` and
 * `generate-render-artifacts.ts` call this — never a user-facing action.
 */
export async function createJobArtifactFile(input: {
  departmentId: string;
  originalName: string;
  buffer: Buffer;
}): Promise<SafeFile> {
  const sniffed = await sniffContentType(input.buffer);
  if (!sniffed) {
    throw validationError(
      "The render result's file type could not be recognized.",
    );
  }

  const rule = resolveFileKind(sniffed.mimeType, sniffed.extension);
  if (!rule) {
    throw validationError(
      `Unsupported render result type (${sniffed.mimeType}). Supported types: JPG, PNG, WEBP images; MP3 audio; MP4 video.`,
    );
  }

  if (input.buffer.byteLength > rule.maxSizeBytes) {
    throw validationError(
      `The render result is too large (max ${(rule.maxSizeBytes / (1024 * 1024)).toFixed(0)} MB for ${rule.kind.toLowerCase()}).`,
    );
  }

  let dimensions: { width: number; height: number } | null = null;
  if (rule.kind === "IMAGE") {
    try {
      dimensions = probeImageDimensions(input.buffer);
    } catch {
      // A screenshot/thumbnail Studio generated itself failing to probe is
      // unexpected but not fatal to the artifact's usefulness — stored
      // without dimensions rather than rejected.
      dimensions = null;
    }
  }

  const contentHash = hashContent(input.buffer);
  const storedName = `${randomUUID()}.${sniffed.extension}`;
  const storageKey = `${input.departmentId}/${storedName}`;

  try {
    await storage.put(storageKey, input.buffer);
  } catch (error) {
    logger.error("Storage write failed for a Job artifact", {
      storageKey,
      cause: error,
    });
    throw dependencyError("Could not store the render result. Please retry.");
  }

  try {
    return await createFile({
      departmentId: input.departmentId,
      category: "JOB_ARTIFACT",
      kind: rule.kind,
      originalName: input.originalName,
      storedName,
      storageKey,
      mimeType: sniffed.mimeType,
      sizeBytes: input.buffer.byteLength,
      contentHash,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      uploadedByUserId: null,
    });
  } catch (error) {
    await storage.delete(storageKey).catch((cleanupError: unknown) => {
      logger.error(
        "Failed to clean up orphaned storage object after a failed Job artifact write",
        { storageKey, cause: cleanupError },
      );
    });
    logger.error("Database write failed for a Job artifact", {
      storageKey,
      cause: error,
    });
    throw error;
  }
}
