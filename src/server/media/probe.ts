import "server-only";

import { createHash, randomUUID } from "node:crypto";
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

export interface GeneratedStorageName {
  /** System-generated, Worker/filesystem-safe `<uuid>.<ext>` — never derived from `originalName`. */
  storedName: string;
  /** `<departmentId>/<storedName>` — the `StorageAdapter` key. Server-controlled end to end. */
  storageKey: string;
}

/**
 * The one place a File's technical storage name/key is generated —
 * `features/files/use-cases/upload-file.ts` (Gallery uploads) and
 * `features/files/use-cases/create-job-artifact.ts` (Worker render results)
 * both call this instead of each inlining the same two lines. Lives here
 * (server-only, alongside the other byte-level file helpers) rather than in
 * the isomorphic `features/files/domain/file-types.ts` — that module is also
 * imported by a Client Component (`file-picker.tsx`), which can never pull in
 * `node:crypto`.
 *
 * Deliberately **never** derived from the client-supplied `originalName` —
 * `randomUUID()` is the only source of uniqueness, so two files (same or
 * different original names, same or different Unicode/punctuation/length)
 * can never collide and never need any of `originalName`'s characters
 * sanitized for filesystem/Worker safety. `extension` must already be the
 * one resolved by `resolveFileKind`/sniffed by `sniffContentType` — never
 * the client's declared extension — so the technical name is exactly what
 * `resolveFileKind` validated, lowercased for consistency.
 *
 * The department segment keeps storage keys naturally partitioned (and
 * matches `departmentScopeFilter`'s scoping everywhere else) — it is never
 * client-supplied either; every caller already resolves `departmentId`
 * server-side before reaching here.
 */
export function generateStorageName(
  departmentId: string,
  extension: string,
): GeneratedStorageName {
  const storedName = `${randomUUID()}.${extension.toLowerCase()}`;
  return { storedName, storageKey: `${departmentId}/${storedName}` };
}
