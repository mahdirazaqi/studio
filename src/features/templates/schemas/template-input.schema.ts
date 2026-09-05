import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { templateAssetInputSchema } from "@/features/templates/schemas/template-asset-input.schema";
import { findDuplicateAssetKey } from "@/features/templates/domain/template-asset-rules";

/**
 * The full Template configuration, shared by create and edit
 * (docs/domain/templates.md "Creation & editing"). Editing always submits the
 * complete asset list — see "Updating Template assets": assets are replaced
 * wholesale rather than diffed, which is simple and safe because a Template's
 * mutable configuration never needs to preserve continuity for a historical
 * Job (that's what a future Job's own immutable snapshot is for, ADR-0010).
 */
export const templateInputSchema = z
  .object({
    /** Only honored for ADMIN — see `resolveTargetDepartment` in the use case. */
    departmentId: commonSchemas.id.optional(),
    name: commonSchemas.shortText,
    composition: commonSchemas.shortText,
    source: commonSchemas.shortText,
    scriptRef: commonSchemas.shortText,
    outputPattern: commonSchemas.shortText,
    description: z.string().trim().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(25).default([]),
    assets: z.array(templateAssetInputSchema).max(50).default([]),
  })
  .superRefine((data, ctx) => {
    const duplicate = findDuplicateAssetKey(data.assets);
    if (duplicate) {
      ctx.addIssue({
        code: "custom",
        path: ["assets"],
        message: `Duplicate asset key "${duplicate}". Asset keys must be unique within a template.`,
      });
    }
  });

export type TemplateInput = z.infer<typeof templateInputSchema>;

export const templateIdParamSchema = z.object({
  templateId: commonSchemas.id,
});
