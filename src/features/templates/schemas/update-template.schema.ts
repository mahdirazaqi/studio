import { z } from "zod";

import {
  templateIdParamSchema,
  templateInputSchema,
} from "@/features/templates/schemas/template-input.schema";

/**
 * `templateInputSchema` already ends in a `superRefine` (duplicate-key
 * check), so it can't be `.extend()`-ed directly — `z.intersection` composes
 * it with the id param instead, preserving both the field shape and the
 * refinement.
 */
export const updateTemplateSchema = z.intersection(
  templateIdParamSchema,
  templateInputSchema,
);

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
