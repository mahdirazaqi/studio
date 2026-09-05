import { z } from "zod";

import { FILE_KINDS } from "@/features/files/domain/file-types";

export const listFilesSchema = z.object({
  /** Free-text search against `originalName` (case-insensitive substring). */
  q: z.string().trim().max(200).optional(),
  kind: z.enum(FILE_KINDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export type ListFilesInput = z.infer<typeof listFilesSchema>;
