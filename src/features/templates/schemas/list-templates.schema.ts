import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { TEMPLATE_STATUSES } from "@/features/templates/domain/template";

export const listTemplatesSchema = z.object({
  /** Free-text search against `name` (case-insensitive substring). */
  q: z.string().trim().max(200).optional(),
  status: z.enum(TEMPLATE_STATUSES).optional(),
  page: commonSchemas.page,
  pageSize: commonSchemas.pageSize,
});

export type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
