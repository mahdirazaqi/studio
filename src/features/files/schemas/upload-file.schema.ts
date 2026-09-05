import { z } from "zod";

import { MAX_UPLOAD_SIZE_BYTES } from "@/features/files/domain/file-types";

/**
 * Shape-level validation only — "is this a non-empty File under the absolute
 * ceiling". The real, per-kind rules (which extensions/MIME types, the exact
 * size cap for that kind) run in the use case after the bytes are sniffed
 * (`resolveFileKind` needs the sniffed type, which Zod can't do inline).
 */
export const uploadFileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, "The selected file is empty.")
    .refine(
      (f) => f.size <= MAX_UPLOAD_SIZE_BYTES,
      "The selected file is too large.",
    ),
  /**
   * Only honored when the actor is ADMIN (docs/domain/authorization.md —
   * "Upload file: ... Into own department (ADMIN: any)"). Ignored for
   * USER/MANAGER, whose department is always derived from the actor.
   */
  departmentId: z.string().min(1).max(64).optional(),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
