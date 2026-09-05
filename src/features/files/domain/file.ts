import type { FileKind } from "@/features/files/domain/file-types";

export type { FileKind };

/** Mirrors the Prisma `FileCategory` enum's values — see `prisma/schema.prisma`. */
export const FILE_CATEGORIES = ["GALLERY_ASSET", "JOB_ARTIFACT"] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

/**
 * A File, safe to hand to a Server Component or return from a Server Action.
 * Deliberately excludes `storageKey` — the browser only ever needs a File's
 * `id`; the storage key is resolved server-side, after authorization, by the
 * `/api/files/[fileId]` route (docs/architecture/files.md).
 */
export interface SafeFile {
  id: string;
  departmentId: string;
  category: FileCategory;
  kind: FileKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  createdAt: Date;
}
