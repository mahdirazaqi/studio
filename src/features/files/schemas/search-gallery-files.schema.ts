import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { FILE_KINDS } from "@/features/files/domain/file-types";

/**
 * Backs the Job asset File Picker's live search
 * (`features/files/components/file-picker.tsx`) — deliberately separate from
 * `list-files.schema.ts`, which backs the full `/files` Gallery page and its
 * URL-driven pagination. `departmentId` here is advisory narrowing only (see
 * `ListFilesFilters.departmentId`'s doc comment) — never a security boundary
 * by itself; a non-ADMIN's own department is always what
 * `departmentScopeFilter` enforces regardless of what's submitted here.
 */
export const searchGalleryFilesSchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.enum(FILE_KINDS).optional(),
  departmentId: commonSchemas.id.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

export type SearchGalleryFilesInput = z.infer<typeof searchGalleryFilesSchema>;
