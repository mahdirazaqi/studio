import { authorize, requireRole, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import {
  findTemplateInScope,
  updateTemplateWithAssets,
} from "@/features/templates/repository/template-repository";
import { departmentExists } from "@/features/departments/repository/department-repository";
import { verifyAssetFileReferences } from "@/features/templates/use-cases/verify-file-references";
import { verifyYoutubeTargetReference } from "@/features/templates/use-cases/verify-youtube-target";
import type { UpdateTemplateInput } from "@/features/templates/schemas/update-template.schema";

/**
 * Edit a Template's full configuration (docs/domain/templates.md "Creation &
 * editing").
 *
 * **Department transfer — implemented, ADR-0040 (revises the earlier
 * "immutable after creation" design).** Only ADMIN may change
 * `input.departmentId` to a different department than the Template
 * currently has; a USER/MANAGER's `input.departmentId` is silently ignored
 * whenever it differs from the existing value (never trusted from the
 * client — `requireRole` gates the transfer branch itself, not just a
 * capability floor a crafted request could otherwise slip past). The target
 * department must actually exist. Every dependent reference — asset
 * `defaultFileId`s, `youtubeTargetId` — is **re-verified against the target
 * department**, not the original: `verifyAssetFileReferences`/
 * `verifyYoutubeTargetReference` already do exactly this check for a plain
 * edit, so a transfer that would leave the Template pointing at another
 * department's Files/Target is rejected with the same clean `business_rule`
 * error a same-department edit would get, never silently transferred anyway.
 *
 * **Historical integrity is unaffected by a transfer** (docs/domain/jobs.md
 * "Historical integrity for Jobs"): `Job.departmentId` is copied onto the
 * Job row once, at creation, from the Template's department *at that time*
 * — it is a plain stored column, never a live join through `Job.templateId`.
 * Moving a Template to a different department later does not, and cannot,
 * retroactively change which department any existing Job belongs to.
 *
 * Editing never touches an existing Job — there is no Job yet to touch, and
 * won't be affected by this once it exists either way, because a Job holds
 * its own immutable creation-time snapshot (ADR-0010).
 */
export async function updateTemplate(
  actor: Actor,
  input: UpdateTemplateInput,
): Promise<SafeTemplateDetail> {
  const existing = await findTemplateInScope(actor, input.templateId);
  if (!existing) throw notFoundError();

  authorize(actor, "template:manage", { departmentId: existing.departmentId });

  if (existing.deletedAt) {
    throw businessRuleError(
      "This template has been deleted and can no longer be edited.",
    );
  }

  let targetDepartmentId = existing.departmentId;
  if (input.departmentId && input.departmentId !== existing.departmentId) {
    requireRole(actor, "ADMIN");
    if (!(await departmentExists(input.departmentId))) {
      throw businessRuleError("The selected department does not exist.");
    }
    targetDepartmentId = input.departmentId;
  }

  await verifyAssetFileReferences(targetDepartmentId, input.assets);
  const youtubeTargetId = await verifyYoutubeTargetReference(
    targetDepartmentId,
    input.youtubeTargetId,
  );

  return updateTemplateWithAssets({
    templateId: existing.id,
    departmentId: targetDepartmentId,
    name: input.name,
    composition: input.composition,
    source: input.source,
    scriptRef: input.scriptRef,
    outputPattern: input.outputPattern,
    description: input.description ?? null,
    tags: input.tags,
    youtubeTargetId,
    assets: input.assets.map((asset) => ({
      key: asset.key,
      kind: asset.kind,
      composition: asset.composition,
      layer: asset.layer,
      imageRatio: asset.imageRatio ?? null,
      defaultFileId: asset.defaultFileId ?? null,
    })),
  });
}
