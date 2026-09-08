import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import {
  findTemplateInScope,
  updateTemplateWithAssets,
} from "@/features/templates/repository/template-repository";
import { verifyAssetFileReferences } from "@/features/templates/use-cases/verify-file-references";
import type { UpdateTemplateInput } from "@/features/templates/schemas/update-template.schema";

/**
 * Edit a Template's full configuration (docs/domain/templates.md "Creation &
 * editing").
 *
 * **A Template's Department is immutable through this operation** — always
 * `existing.departmentId`, never anything derived from `input` (there is no
 * `departmentId` field on `UpdateTemplateInput` to begin with; see
 * `updateTemplateSchema`'s doc comment for the structural half of this
 * guarantee). This is deliberate, not an oversight: a Department **transfer**
 * is a separate, ADMIN-only operation — `transferTemplateDepartment` — kept
 * out of the ordinary edit flow so a MANAGER's routine Template edit can
 * never accidentally (or maliciously, via a crafted request) move a Template
 * to a different Department. See `docs/domain/templates.md` "Department
 * transfer" before touching this code path.
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

  return updateTemplateWithAssets({
    templateId: existing.id,
    name: input.name,
    composition: input.composition,
    source: input.source,
    scriptRef: input.scriptRef,
    outputPattern: input.outputPattern,
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
