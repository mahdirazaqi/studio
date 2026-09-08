import { z } from "zod";

import { commonSchemas } from "@/server/validation";

/**
 * The **separate**, ADMIN-only Department transfer operation
 * (docs/domain/templates.md "Department transfer") — deliberately not part
 * of `updateTemplateSchema`. Ordinary Template Edit can never carry a
 * `departmentId`; this is the one dedicated path that can, and it changes
 * nothing else about the Template (no config/asset fields here at all).
 */
export const transferTemplateDepartmentSchema = z.object({
  templateId: commonSchemas.id,
  departmentId: commonSchemas.id,
});

export type TransferTemplateDepartmentInput = z.infer<
  typeof transferTemplateDepartmentSchema
>;
