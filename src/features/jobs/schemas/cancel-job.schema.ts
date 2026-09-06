import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const cancelJobSchema = z.object({
  jobId: commonSchemas.id,
  reason: z.string().trim().max(500).optional(),
});

export type CancelJobInput = z.infer<typeof cancelJobSchema>;
