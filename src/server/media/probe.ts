import "server-only";

import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { imageSize } from "image-size";

/**
 * Stateless helpers for inspecting raw file bytes — no DB, no storage, no
 * business rules (which extensions/kinds Studio allows lives in
 * `@/features/files/domain/file-types.ts`, which calls these). Never trust a
 * client-declared filename/MIME type for anything security- or
 * validation-relevant; these functions look at the actual bytes.
 */

/** The real content type, sniffed from magic bytes — `null` if unrecognized. */
export async function sniffContentType(
  data: Buffer,
): Promise<{ mimeType: string; extension: string } | null> {
  const result = await fileTypeFromBuffer(data);
  if (!result) return null;
  return { mimeType: result.mime, extension: result.ext };
}

/** Pixel dimensions for a still image. Throws if `data` isn't a decodable image. */
export function probeImageDimensions(data: Buffer): {
  width: number;
  height: number;
} {
  const { width, height } = imageSize(data);
  return { width, height };
}

/** SHA-256 hex digest, for the advisory dedup lookup (OD-20). */
export function hashContent(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
