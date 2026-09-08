import { z } from "zod";

import {
  templateIdParamSchema,
  templateInputSchema,
} from "@/features/templates/schemas/template-input.schema";

/**
 * `templateInputSchema` already ends in a `superRefine` (duplicate-key
 * check), so it can't be `.extend()`-ed directly — `z.intersection` composes
 * it with the id param instead, preserving both the field shape and the
 * refinement. **Deliberately no `departmentId`** — `templateInputSchema`
 * itself has no such field, so one submitted by a client is stripped during
 * parsing and never reaches `updateTemplate` at all (see
 * `template-input.schema.ts`'s doc comment). A Template's Department is
 * immutable through this action; see `transfer-template-department.schema.ts`
 * for the separate, ADMIN-only transfer operation.
 */
export const updateTemplateSchema = z.intersection(
  templateIdParamSchema,
  templateInputSchema,
);

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
