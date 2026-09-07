import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { jobAssetInputSchema } from "@/features/jobs/schemas/job-asset-input.schema";
import { findDuplicateSlotKey } from "@/features/jobs/domain/job-asset-rules";

/**
 * A Job's Department is never a separate field — it is always derived from
 * the chosen Template (`features/jobs/use-cases/create-job.ts`), which is
 * itself department-scoped (or, for ADMIN, resolvable across departments).
 * This is what actually makes "never trust a client-provided Department ID"
 * (Phase 6 brief §4) true by construction rather than by a check someone
 * could forget: there is no `departmentId` field here to trust or distrust.
 */
export const createJobSchema = z
  .object({
    templateId: commonSchemas.id,
    assets: z.array(jobAssetInputSchema).max(50).default([]),
  })
  .superRefine((data, ctx) => {
    const duplicate = findDuplicateSlotKey(data.assets);
    if (duplicate) {
      ctx.addIssue({
        code: "custom",
        path: ["assets"],
        message: `Duplicate value for slot "${duplicate}".`,
      });
    }
  });

export type CreateJobInput = z.infer<typeof createJobSchema>;
