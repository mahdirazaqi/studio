import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { templateInputSchema } from "@/features/templates/schemas/template-input.schema";

/**
 * Create-only extension of `templateInputSchema`: the one place a
 * `departmentId` is ever accepted on a Template write — and only honored for
 * ADMIN, choosing which Department a brand-new Template belongs to
 * (`resolveTargetDepartment`; a non-ADMIN's value is always ignored
 * server-side, never trusted). Once created, a Template's Department is
 * immutable through the ordinary edit flow — see `template-input.schema.ts`'s
 * doc comment and `transfer-template-department.schema.ts` for the separate,
 * ADMIN-only transfer operation.
 */
export const createTemplateSchema = z.intersection(
  templateInputSchema,
  z.object({
    departmentId: commonSchemas.id.optional(),
  }),
);

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
