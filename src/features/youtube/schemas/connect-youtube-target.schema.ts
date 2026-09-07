import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const connectYoutubeTargetSchema = z.object({
  name: commonSchemas.shortText,
  /** Obtained out-of-band (docs/integrations/youtube.md) — never logged, never
   * echoed back in a response. */
  refreshToken: z.string().trim().min(1).max(2000),
  /** Many-to-many (ADR-0040) — at least one Department required at
   * connection time; editable afterward via `updateYoutubeTargetDepartments`. */
  departmentIds: z
    .array(commonSchemas.id)
    .min(1, "Select at least one department."),
});

export type ConnectYoutubeTargetInput = z.infer<
  typeof connectYoutubeTargetSchema
>;

export const youtubeTargetIdParamSchema = z.object({
  targetId: commonSchemas.id,
});

export const updateYoutubeTargetDepartmentsSchema = z.object({
  targetId: commonSchemas.id,
  departmentIds: z
    .array(commonSchemas.id)
    .min(1, "Select at least one department."),
});

export type UpdateYoutubeTargetDepartmentsInput = z.infer<
  typeof updateYoutubeTargetDepartmentsSchema
>;
