import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const retryJobDeliverySchema = z.object({
  jobId: commonSchemas.id,
});

export type RetryJobDeliveryInput = z.infer<typeof retryJobDeliverySchema>;
