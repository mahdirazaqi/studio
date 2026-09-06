import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { ROLES } from "@/lib/roles";

export const changeUserRoleSchema = z.object({
  userId: commonSchemas.id,
  role: z.enum(ROLES),
});

export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
