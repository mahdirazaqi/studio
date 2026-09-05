import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import {
  TEMPLATE_ASSET_KINDS,
  TEMPLATE_IMAGE_RATIOS,
} from "@/features/templates/domain/template";
import { checkAssetKindConsistency } from "@/features/templates/domain/template-asset-rules";

/**
 * One slot definition, as submitted by the create/edit form. Cross-field
 * consistency (imageRatio/defaultFileId vs. kind) is delegated to
 * `checkAssetKindConsistency` so the rule has one definition, shared with its
 * unit tests — see `domain/template-asset-rules.ts`.
 */
export const templateAssetInputSchema = z
  .object({
    /** Stable slot key — letters, digits, hyphen, underscore only. */
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Use letters, numbers, hyphens, and underscores only.",
      ),
    kind: z.enum(TEMPLATE_ASSET_KINDS),
    composition: commonSchemas.shortText,
    layer: commonSchemas.shortText,
    imageRatio: z.enum(TEMPLATE_IMAGE_RATIOS).optional(),
    /** A Gallery File id. Existence + department match is verified server-side. */
    defaultFileId: commonSchemas.id.optional(),
  })
  .superRefine((asset, ctx) => {
    const issues = checkAssetKindConsistency(asset);
    if (issues.imageRatio) {
      ctx.addIssue({
        code: "custom",
        path: ["imageRatio"],
        message: issues.imageRatio,
      });
    }
    if (issues.defaultFileId) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultFileId"],
        message: issues.defaultFileId,
      });
    }
  });

export type TemplateAssetInput = z.infer<typeof templateAssetInputSchema>;
