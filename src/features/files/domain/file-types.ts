/**
 * The allowed file types and per-kind size limits — centralized here rather
 * than scattered across the upload form, the Server Action, and the use case
 * (docs/security/security.md §6, §13 of the Phase 4 brief).
 *
 * Transcribed from the legacy allow-list (`qtical-backend-node/src/render/
 * file/file.controller.ts`'s `uploaderOptions.fileFilter`:
 * `jpg|jpeg|png|webp|mp4|mp3`), not invented and not narrowed — OD-21 asked to
 * confirm the Studio list against what legacy already supported, and this is
 * it. Size limits are new (legacy had none) — see ADR-0026 for the numbers'
 * rationale, resolving OD-21's size-limit half.
 *
 * Pure — no I/O, no Prisma import, no `node:*` import (domain layers stay
 * isomorphic: `features/files/components/file-picker.tsx` — a Client
 * Component — imports this module too, so anything server-only, including
 * `node:crypto`, belongs in `@/server/media` instead — see
 * `generateStorageName` there for the technical-filename counterpart to
 * this module's kind/size rules).
 */

/** Mirrors the Prisma `FileKind` enum's values exactly — see `prisma/schema.prisma`. */
export const FILE_KINDS = ["IMAGE", "AUDIO", "VIDEO"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

interface FileKindRule {
  kind: FileKind;
  /** Sniffed MIME types (from `file-type`) accepted for this kind. */
  mimeTypes: readonly string[];
  /** Extensions (lowercase, no dot) accepted for this kind — must agree with the sniffed type. */
  extensions: readonly string[];
  maxSizeBytes: number;
}

const MB = 1024 * 1024;

/**
 * ADR-0026: images 25 MB, audio 100 MB, video 500 MB. Generous enough for the
 * media Studio actually handles (source clips and rendered output, not raw
 * camera footage) without leaving the limit effectively unbounded.
 */
export const FILE_KIND_RULES: readonly FileKindRule[] = [
  {
    kind: "IMAGE",
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    extensions: ["jpg", "jpeg", "png", "webp"],
    maxSizeBytes: 25 * MB,
  },
  {
    kind: "AUDIO",
    mimeTypes: ["audio/mpeg"],
    extensions: ["mp3"],
    maxSizeBytes: 100 * MB,
  },
  {
    kind: "VIDEO",
    mimeTypes: ["video/mp4"],
    extensions: ["mp4"],
    maxSizeBytes: 500 * MB,
  },
];

/** The largest size any kind allows — used as a cheap first-pass rejection before sniffing. */
export const MAX_UPLOAD_SIZE_BYTES = Math.max(
  ...FILE_KIND_RULES.map((r) => r.maxSizeBytes),
);

/**
 * Resolve the kind for a sniffed MIME type + extension, or `null` if the
 * combination isn't allowed. Both must agree with the *same* rule — a `.mp3`
 * file whose sniffed bytes say `video/mp4` (or vice versa) is rejected, not
 * silently accepted under either kind.
 */
export function resolveFileKind(
  sniffedMimeType: string,
  extension: string,
): FileKindRule | null {
  const normalizedExt = extension.toLowerCase();
  return (
    FILE_KIND_RULES.find(
      (rule) =>
        rule.mimeTypes.includes(sniffedMimeType) &&
        rule.extensions.includes(normalizedExt),
    ) ?? null
  );
}
