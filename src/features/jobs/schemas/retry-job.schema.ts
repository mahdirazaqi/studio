import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const retryJobSchema = z.object({
  jobId: commonSchemas.id,
  reason: z.string().trim().max(500).optional(),
});

export type RetryJobInput = z.infer<typeof retryJobSchema>;
