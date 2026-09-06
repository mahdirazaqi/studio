import { z } from "zod";

import { commonSchemas } from "@/server/validation";

export const connectYoutubeTargetSchema = z.object({
  /** Only honored for ADMIN — see `resolveTargetDepartment` in the use case. */
  departmentId: commonSchemas.id.optional(),
  name: commonSchemas.shortText,
  /** Obtained out-of-band (docs/integrations/youtube.md) — never logged, never
   * echoed back in a response. */
  refreshToken: z.string().trim().min(1).max(2000),
});

export type ConnectYoutubeTargetInput = z.infer<
  typeof connectYoutubeTargetSchema
>;

export const youtubeTargetIdParamSchema = z.object({
  targetId: commonSchemas.id,
});
