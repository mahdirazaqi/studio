import { authorize, type Actor } from "@/server/authz";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import { createTemplateWithAssets } from "@/features/templates/repository/template-repository";
import { resolveTargetDepartment } from "@/features/templates/use-cases/resolve-target-department";
import { verifyAssetFileReferences } from "@/features/templates/use-cases/verify-file-references";
import { verifyYoutubeTargetReference } from "@/features/templates/use-cases/verify-youtube-target";
import type { TemplateInput } from "@/features/templates/schemas/template-input.schema";

/**
 * Create a Template (docs/domain/templates.md "Creation & editing").
 * `template:manage` is a MANAGER+ capability (ADR-0022; confirmed for this
 * phase — see docs/domain/authorization.md's Templates section) — a USER can
 * view/consume Templates but not author them.
 */
export async function createTemplate(
  actor: Actor,
  input: TemplateInput,
): Promise<SafeTemplateDetail> {
  const departmentId = await resolveTargetDepartment(actor, input.departmentId);
  authorize(actor, "template:manage", { departmentId });

  await verifyAssetFileReferences(departmentId, input.assets);
  const youtubeTargetId = await verifyYoutubeTargetReference(
    departmentId,
    input.youtubeTargetId,
  );

  return createTemplateWithAssets({
    departmentId,
    createdByUserId: actor.userId,
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
