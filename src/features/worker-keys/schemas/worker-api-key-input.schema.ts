import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const createWorkerApiKeySchema = z.object({
  name: commonSchemas.shortText,
  departmentIds: z
    .array(commonSchemas.id)
    .min(1, "Select at least one department."),
});

export type CreateWorkerApiKeyInput = z.infer<typeof createWorkerApiKeySchema>;

export const workerApiKeyIdParamSchema = z.object({
  keyId: commonSchemas.id,
});

export const updateWorkerApiKeyDepartmentsSchema = z.object({
  keyId: commonSchemas.id,
  departmentIds: z
    .array(commonSchemas.id)
    .min(1, "Select at least one department."),
});

export type UpdateWorkerApiKeyDepartmentsInput = z.infer<
  typeof updateWorkerApiKeyDepartmentsSchema
>;
