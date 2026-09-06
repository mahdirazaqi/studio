import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const createDepartmentSchema = z.object({
  name: commonSchemas.shortText,
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const renameDepartmentSchema = z.object({
  departmentId: commonSchemas.id,
  name: commonSchemas.shortText,
});

export type RenameDepartmentInput = z.infer<typeof renameDepartmentSchema>;
