import { z } from "zod";

import { commonSchemas } from "@/server/validation";

/**
 * One resolved slot value, as submitted by the Job creation form. Shape-level
 * only — "exactly one of `text`/`fileId` is present". Whether *this* slot
 * should have gotten `text` or `fileId` depends on the Template asset's
 * `kind`, which Zod can't know here; that cross-check happens in
 * `features/jobs/use-cases/create-job.ts`, once the Template is loaded —
 * mirrors how `features/templates/schemas/template-asset-input.schema.ts`
 * defers its own kind-dependent rules to the same layer.
 */
export const jobAssetInputSchema = z
  .object({
    /** Must match a `TemplateAsset.key` on the chosen Template. */
    slotKey: z.string().trim().min(1).max(100),
    text: z.string().trim().max(10_000).optional(),
    fileId: commonSchemas.id.optional(),
  })
  .refine((asset) => Boolean(asset.text) !== Boolean(asset.fileId), {
    message: "Provide either a text value or a file, not both or neither.",
    path: ["text"],
  });

export type JobAssetInput = z.infer<typeof jobAssetInputSchema>;
