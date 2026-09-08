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
 *
 * **Deliberately has no `departmentId` field.** A Template's Department is
 * immutable through the ordinary edit flow (docs/domain/templates.md
 * "Department transfer", ADR-0042/ADR-0043) — this schema is what the Server
 * Action for **update** parses, so a client-submitted `departmentId` is
 * stripped by Zod before it ever reaches `updateTemplate` (a plain
 * `z.object`, not `.strict()`, silently drops unrecognized keys). This is
 * the structural half of "the backend must guarantee updating a Template
 * cannot change its Department" — `updateTemplate` itself additionally never
 * accepts or forwards one, so there are two independent reasons this can
 * never happen, not just one. See `create-template.schema.ts` for the
 * separate, ADMIN-only department **choice** at creation, and
 * `transfer-template-department.schema.ts` for the separate, ADMIN-only
 * department **transfer** operation.
 */
export const templateInputSchema = z
  .object({
    name: commonSchemas.shortText,
    composition: commonSchemas.shortText,
    source: commonSchemas.shortText,
    scriptRef: commonSchemas.shortText,
    outputPattern: commonSchemas.shortText,
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
