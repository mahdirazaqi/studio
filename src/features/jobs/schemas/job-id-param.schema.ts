import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const jobIdParamSchema = z.object({
  jobId: commonSchemas.id,
});
