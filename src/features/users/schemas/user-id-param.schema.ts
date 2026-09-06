import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const userIdParamSchema = z.object({
  userId: commonSchemas.id,
});

export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
