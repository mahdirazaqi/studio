import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { JOB_STATES } from "@/features/jobs/domain/job";

export const listJobsSchema = z.object({
  /** Free-text search against `title` (case-insensitive substring). */
  q: z.string().trim().max(200).optional(),
  state: z.enum(JOB_STATES).optional(),
  page: commonSchemas.page,
  pageSize: commonSchemas.pageSize,
});

export type ListJobsInput = z.infer<typeof listJobsSchema>;
