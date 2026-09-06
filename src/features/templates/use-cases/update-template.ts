import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import {
  findTemplateInScope,
  updateTemplateWithAssets,
} from "@/features/templates/repository/template-repository";
import { verifyAssetFileReferences } from "@/features/templates/use-cases/verify-file-references";
import { verifyYoutubeTargetReference } from "@/features/templates/use-cases/verify-youtube-target";
import type { UpdateTemplateInput } from "@/features/templates/schemas/update-template.schema";

/**
 * Edit a Template's full configuration (docs/domain/templates.md "Creation &
 * editing"). A Template's Department is immutable after creation — OD-08
 * (cross-department reassignment) is unsupported for every resource, and
 * `input.departmentId` (present only because the create/edit schemas share a
 * shape) is never read here.
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

  await verifyAssetFileReferences(existing.departmentId, input.assets);
  const youtubeTargetId = await verifyYoutubeTargetReference(
    existing.departmentId,
    input.youtubeTargetId,
  );

  return updateTemplateWithAssets({
    templateId: existing.id,
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
