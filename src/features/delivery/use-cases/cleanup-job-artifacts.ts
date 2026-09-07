import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { storage } from "@/server/adapters/storage";
import {
  clearJobVideoFileId,
  findJobById,
} from "@/features/jobs/repository/job-repository";
import {
  deleteFileRow,
  findStorageKey,
} from "@/features/files/repository/file-repository";

/**
 * Hard-deletes a completed (`RENDERED`) Job's rendered-video artifact
 * (never the screenshot/thumbnail — small, kept for potential future
 * display), once it's no longer needed (docs/data/lifecycle-rules.md "Job
 * Artifact retention", OD-18). **Not wired to any automatic trigger this
 * phase** —
 * OD-18's grace-period/scheduling question stays open (no durable-work
 * mechanism exists yet, OD-40); this exists as the safe, tested primitive a
 * future scheduled sweep calls, per the Phase 9 brief's own "implement
 * cleanup, do not invent a scheduler."
 *
 * Reference-aware and safe by construction, not by re-deriving a check: a
 * `JOB_ARTIFACT` video File is created once, by `generate-render-artifacts.ts`,
 * and referenced **only** by this one Job's `videoFileId` — unlike a Gallery
 * Asset, it is never a `TemplateAsset.defaultFileId` or another Job's
 * `JobAsset.fileId` input, so there is no second dependency to check before
 * deleting it (contrast `assertNoActiveJobDependencies`, which exists for
 * exactly that risk on Gallery Assets).
 *
 * Idempotent: a Job with no `videoFileId` (already cleaned up, or never had
 * one) returns `{ cleaned: false }` rather than erroring — calling this twice
 * is always safe.
 */
export async function cleanupJobArtifacts(
  jobId: string,
): Promise<{ cleaned: boolean }> {
  const job = await findJobById(jobId);
  if (!job) throw notFoundError();

  if (job.state !== "RENDERED") {
    throw businessRuleError(
      "Only a job in the RENDERED state may have its rendered video cleaned up.",
    );
  }

  if (!job.videoFileId) return { cleaned: false };

  const fileId = job.videoFileId;
  const storageKey = await findStorageKey(fileId);

  // Database row first, then storage bytes — never the reverse (ADR-0025).
  // Clearing the Job's own pointer first (idempotent — only if it still
  // matches) is what makes a repeated call safe even if a prior attempt
  // deleted the File but crashed before this line.
  await clearJobVideoFileId(jobId, fileId);
  await deleteFileRow(fileId).catch((error: unknown) => {
    // The row may already be gone from a previous, interrupted cleanup —
    // log and continue to the storage delete rather than fail the whole
    // operation (docs/domain/jobs.md "Cleanup" — a cleanup failure must
    // never corrupt Job state, and this Job's state is already correct
    // regardless of how far this function gets).
    logger.warn("Job artifact File row was already gone during cleanup", {
      jobId,
      fileId,
      cause: error,
    });
  });
  if (storageKey) {
    await storage.delete(storageKey).catch((error: unknown) => {
      logger.error(
        "Failed to delete a cleaned-up job artifact's storage bytes",
        {
          jobId,
          fileId,
          storageKey,
          cause: error,
        },
      );
    });
  }

  return { cleaned: true };
}
