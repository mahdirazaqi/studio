import { authorize, requireRole, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import {
  findTemplateInScope,
  transferTemplateDepartment as transferTemplateDepartmentRepo,
} from "@/features/templates/repository/template-repository";
import { departmentExists } from "@/features/departments/repository/department-repository";
import { verifyAssetFileReferences } from "@/features/templates/use-cases/verify-file-references";

/**
 * Transfer a Template to a different Department — **ADMIN-only, and
 * deliberately separate from `updateTemplate`** (docs/domain/templates.md
 * "Department transfer"). Ordinary Template Edit can never change a
 * Template's Department, including via a crafted request (see
 * `update-template.ts`'s doc comment); this is the one dedicated path that
 * can, gated by `requireRole(actor, "ADMIN")` — not just a capability floor
 * a MANAGER could otherwise pass, since `template:manage` itself is
 * `MANAGER+`.
 *
 * Every dependent reference is **re-verified against the target Department,
 * not the original**: `verifyAssetFileReferences` runs against the
 * Template's own already-stored assets (not a client-supplied list — this
 * operation carries no config payload at all) — an asset `defaultFileId`
 * that doesn't resolve in the target Department rejects the whole transfer
 * with a clean `business_rule` error, never silently leaving the Template
 * pointing at another Department's Files.
 *
 * **No historical-integrity mechanism is needed** — `Job.departmentId` is a
 * plain column copied once at Job-creation time, never a live join through
 * the Template, so an existing Job's Department is structurally unaffected
 * by a later transfer (see `docs/data/historical-integrity.md`).
 */
export async function transferTemplateDepartment(
  actor: Actor,
  templateId: string,
  targetDepartmentId: string,
): Promise<SafeTemplateDetail> {
  const existing = await findTemplateInScope(actor, templateId);
  if (!existing) throw notFoundError();

  authorize(actor, "template:manage", { departmentId: existing.departmentId });
  requireRole(actor, "ADMIN");

  if (existing.deletedAt) {
    throw businessRuleError(
      "This template has been deleted and can no longer be edited.",
    );
  }

  if (targetDepartmentId === existing.departmentId) {
    // Idempotent no-op — matches Templates' existing enable/disable/
    // soft-delete convention (a repeat of the current state is not an error).
    return existing;
  }

  if (!(await departmentExists(targetDepartmentId))) {
    throw businessRuleError("The selected department does not exist.");
  }

  await verifyAssetFileReferences(targetDepartmentId, existing.assets);

  return transferTemplateDepartmentRepo(existing.id, targetDepartmentId);
}
