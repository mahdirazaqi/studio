import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const listUsersSchema = z.object({
  /** Free-text search against `fullName`/`email` (case-insensitive substring). */
  q: z.string().trim().max(200).optional(),
  page: commonSchemas.page,
  pageSize: commonSchemas.pageSize,
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;
