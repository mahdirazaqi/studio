import { z } from "zod";

import { commonSchemas } from "@/server/validation";

/**
 * Used by `features/jobs/use-cases/update-job-progress.ts` directly — there
 * is no Server Action for this (progress reports come from the Worker, not
 * the dashboard). Phase 7's Worker Route Handler will parse its request body
 * with this same schema before calling the use case, per the Phase 6 brief
 * §48 ("Do not duplicate this logic in Phase 7").
 */
export const updateJobProgressSchema = z.object({
  jobId: commonSchemas.id,
  progress: z.number().int().min(0).max(100),
});

export type UpdateJobProgressInput = z.infer<typeof updateJobProgressSchema>;
