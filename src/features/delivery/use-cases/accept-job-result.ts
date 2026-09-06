import {
  businessRuleError,
  conflictError,
  notFoundError,
  validationError,
} from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { FILE_KIND_RULES } from "@/features/files/domain/file-types";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import {
  findJobById,
  transitionJobRow,
} from "@/features/jobs/repository/job-repository";
import {
  generateRenderArtifacts,
  rollbackRenderArtifacts,
} from "@/features/delivery/use-cases/generate-render-artifacts";
import { deliverJobResult } from "@/features/delivery/use-cases/deliver-job-result";

const VIDEO_MAX_SIZE_BYTES =
  FILE_KIND_RULES.find((rule) => rule.kind === "VIDEO")?.maxSizeBytes ?? 0;

/**
 * Accept a rendered result from the Worker (legacy `POST /jobs/:id/upload`;
 * docs/integrations/worker-api.md §6, Phase 9, ADR-0039). Called only from
 * `POST /api/worker/v1/jobs/:id/result` after Worker authentication — this
 * function itself takes no `Actor` (the Worker is never one,
 * docs/domain/jobs.md "Worker identity").
 *
 * **Idempotent and race-safe** (docs/integrations/worker-api.md §5's
 * "duplicate Worker request" contract, applied here for the first time to
 * the result-upload path):
 *
 * 1. A Job not currently `RENDERING` that already has a `videoFileId` is a
 *    **duplicate** of an already-accepted result — returned as-is, no
 *    reprocessing, no second delivery run.
 * 2. A Job not currently `RENDERING` with no `videoFileId` is a genuine
 *    error (wrong state to accept a result at all).
 * 3. Two concurrent requests that both observe `RENDERING` both do the
 *    (wasted, but harmless) media-processing work; only one wins the atomic
 *    `RENDERING -> RENDERED` conditional update. The loser rolls back its
 *    own just-created artifacts and re-reads the Job — if the winner's
 *    result is now visible (`videoFileId` set), that is returned instead of
 *    erroring; a Job in a state neither of the two `Worker`s expected is a
 *    real conflict.
 *
 * Delivery (`deliverJobResult`) runs **synchronously, awaited** — never
 * fire-and-forget (docs/integrations/youtube.md "Delivery reliability") —
 * before this returns, so the Worker's own request only completes once the
 * Job has reached its true final state for this result.
 */
export async function acceptJobResult(
  jobId: string,
  videoBuffer: Buffer,
): Promise<SafeJobDetail> {
  const job = await findJobById(jobId);
  if (!job) throw notFoundError();

  if (job.state !== "RENDERING") {
    if (job.videoFileId) {
      logger.info("Duplicate Worker result ignored (already accepted)", {
        jobId,
      });
      return job;
    }
    throw businessRuleError(
      `A job in state ${job.state} cannot accept a render result (expected RENDERING).`,
    );
  }

  if (videoBuffer.byteLength === 0) {
    throw validationError("The render result must not be empty.");
  }
  if (videoBuffer.byteLength > VIDEO_MAX_SIZE_BYTES) {
    throw validationError(
      `The render result is too large (max ${(VIDEO_MAX_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB).`,
    );
  }

  const artifacts = await generateRenderArtifacts(
    job.departmentId,
    videoBuffer,
  );

  const updated = await transitionJobRow(jobId, ["RENDERING"], "RENDERED", {
    renderedAt: new Date(),
    videoFileId: artifacts.video.id,
    screenshotFileId: artifacts.screenshot.id,
    thumbnailFileId: artifacts.thumbnail.id,
  });

  if (!updated) {
    await rollbackRenderArtifacts(artifacts);
    const current = await findJobById(jobId);
    if (current?.videoFileId) {
      logger.info(
        "Lost the RENDERING -> RENDERED race to a concurrent result; returning the winner's result",
        { jobId },
      );
      return current;
    }
    throw conflictError(
      "This job's state changed before the result could be recorded. Please retry.",
    );
  }

  return deliverJobResult(updated);
}
