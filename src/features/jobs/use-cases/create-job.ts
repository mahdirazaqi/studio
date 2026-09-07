import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import { findTemplateInScope } from "@/features/templates/repository/template-repository";
import { findConnectedYoutubeTargetForDepartment } from "@/features/youtube/repository/youtube-target-repository";
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

  // Legacy: "a Job is uploaded to YouTube only if upload===true AND the
  // Template has a channel" (docs/integrations/youtube.md). Studio checks
  // this once, here, at creation — never silently ignored, and never
  // re-checked against the live Template later: the Target's identity is
  // captured in the Job's own immutable `snapshot` below, so a later
  // disconnect/reassignment can never change what an already-created Job
  // believes it should deliver to.
  const youtubeTarget = input.deliverToYouTube
    ? await (async () => {
        if (!template.youtubeTargetId) {
          throw businessRuleError(
            "This template has no connected YouTube channel, so a job created from it cannot deliver to YouTube.",
          );
        }
        const target = await findConnectedYoutubeTargetForDepartment(
          template.departmentId,
          template.youtubeTargetId,
        );
        if (!target) {
          throw businessRuleError(
            "This template's YouTube channel is no longer connected, so a job created from it cannot deliver to YouTube.",
          );
        }
        return target;
      })()
    : null;

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
    youtubeTarget: youtubeTarget
      ? {
          id: youtubeTarget.id,
          name: youtubeTarget.name,
          youtubeChannelId: youtubeTarget.youtubeChannelId,
        }
      : null,
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
