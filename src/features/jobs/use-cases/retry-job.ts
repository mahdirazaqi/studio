import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import { env } from "@/server/env";
import { canRetryFromState } from "@/features/jobs/domain/job-state-machine";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import {
  createRetryJob,
  findJobInScope,
  type JobAssetData,
} from "@/features/jobs/repository/job-repository";

/**
 * Non-destructive retry (ADR-0005, ADR-0031; docs/domain/jobs.md "Retry").
 *
 * Historical integrity (Phase 6 brief §26 — critical): a retry copies the
 * **original Job's** `snapshot` and `JobAsset` rows verbatim. It never
 * re-loads the live Template or re-resolves Files — if either changed since
 * the original was created, the retry still renders exactly what the
 * original was supposed to. This is why `retryJob` never calls
 * `resolveJobAssets` or touches `features/templates/repository` at all.
 *
 * Eligibility: `ERROR` or `CANCELED` only (`canRetryFromState`, resolves the
 * "which states" half of OD-02), and within `JOB_RETRY_WINDOW_DAYS` of the
 * *original's* creation (resolves the window half of OD-02 — default 3 days,
 * matching legacy, configurable). The original is never modified or deleted.
 */
export async function retryJob(
  actor: Actor,
  jobId: string,
  reason?: string,
): Promise<SafeJobDetail> {
  const original = await findJobInScope(actor, jobId);
  if (!original) throw notFoundError();

  authorize(actor, "job:manage", { departmentId: original.departmentId });

  if (!canRetryFromState(original.state)) {
    throw businessRuleError(
      `A job in state ${original.state} cannot be retried.`,
    );
  }

  const windowMs = env.JOB_RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - original.createdAt.getTime() > windowMs) {
    throw businessRuleError(
      `This job is older than the ${env.JOB_RETRY_WINDOW_DAYS}-day retry window and can no longer be retried.`,
    );
  }

  const assets: JobAssetData[] = original.assets.map((asset) => ({
    slotKey: asset.slotKey,
    kind: asset.kind,
    composition: asset.composition,
    layer: asset.layer,
    textValue: asset.textValue,
    fileId: asset.fileId,
    fileOriginalName: asset.fileOriginalName,
    fileMimeType: asset.fileMimeType,
    fileSizeBytes: asset.fileSizeBytes,
    fileWidth: asset.fileWidth,
    fileHeight: asset.fileHeight,
  }));

  return createRetryJob({
    originalJobId: original.id,
    departmentId: original.departmentId,
    // The retry keeps the *original's* creator (legacy `_createdBy` behavior,
    // kept) — `retriedByUserId` below is who actually triggered this retry.
    createdByUserId: original.createdByUserId,
    templateId: original.templateId,
    snapshot: original.snapshot,
    title: original.title,
    deliverToYouTube: original.deliverToYouTube,
    attemptNumber: original.attemptNumber + 1,
    retriedByUserId: actor.userId,
    retryReason: reason ?? null,
    assets,
  });
}
