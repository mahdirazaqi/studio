import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import { findTemplateInScope } from "@/features/templates/repository/template-repository";
import { resolveJobAssets } from "@/features/jobs/use-cases/resolve-job-assets";
import { createJobWithAssets } from "@/features/jobs/repository/job-repository";
import type { JobSnapshot, SafeJobDetail } from "@/features/jobs/domain/job";
import type { CreateJobInput } from "@/features/jobs/schemas/create-job.schema";

/**
 * Create a Job (docs/domain/jobs.md "Creation"). A Job's Department is never
 * a separate input — it is always the chosen Template's Department, so there
 * is nothing for a client to lie about (Phase 6 brief §4). `findTemplateInScope`
 * already resolves any Template ADMIN can see (all of them) and only the
 * actor's own department's Templates for USER/MANAGER (returning `null`,
 * folded into `not_found`, for a cross-department id) — reused directly from
 * the Templates feature rather than re-implemented here.
 */
export async function createJob(
  actor: Actor,
  input: CreateJobInput,
): Promise<SafeJobDetail> {
  const template = await findTemplateInScope(actor, input.templateId);
  if (!template) throw notFoundError();

  authorize(actor, "job:manage", { departmentId: template.departmentId });

  if (template.deletedAt) {
    throw businessRuleError(
      "This template has been deleted and can no longer be used to create jobs.",
    );
  }
  if (template.status !== "ACTIVE") {
    throw businessRuleError(
      "This template is disabled and can no longer be used to create jobs.",
    );
  }

  const { jobAssets, title } = await resolveJobAssets({
    departmentId: template.departmentId,
    templateAssets: template.assets,
    scriptRef: template.scriptRef,
    inputAssets: input.assets,
  });

  const snapshot: JobSnapshot = {
    templateId: template.id,
    templateName: template.name,
    composition: template.composition,
    source: template.source,
    scriptRef: template.scriptRef,
    outputPattern: template.outputPattern,
    description: template.description,
    tags: template.tags,
    assetSlotDefinitions: template.assets.map((asset) => ({
      key: asset.key,
      kind: asset.kind,
      composition: asset.composition,
      layer: asset.layer,
      imageRatio: asset.imageRatio,
    })),
  };

  return createJobWithAssets({
    departmentId: template.departmentId,
    createdByUserId: actor.userId,
    templateId: template.id,
    snapshot,
    title,
    deliverToYouTube: input.deliverToYouTube,
    assets: jobAssets,
  });
}
