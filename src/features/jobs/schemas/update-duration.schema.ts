import { z } from "zod";

import { commonSchemas } from "@/server/validation";

/** See `update-progress.schema.ts`'s doc comment — same reasoning applies. */
export const updateJobDurationSchema = z.object({
  jobId: commonSchemas.id,
  durationSeconds: z.number().int().min(0),
});

export type UpdateJobDurationInput = z.infer<typeof updateJobDurationSchema>;
