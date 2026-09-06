import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { ROLES } from "@/lib/roles";

export const createUserSchema = z.object({
  /** Only honored for ADMIN — see `resolveTargetDepartment` in the use case. */
  departmentId: commonSchemas.id.optional(),
  email: z.email("Enter a valid email address."),
  fullName: commonSchemas.shortText,
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(ROLES),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
