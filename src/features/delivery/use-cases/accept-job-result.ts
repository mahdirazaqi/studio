import { assertWorkerDepartmentAccess } from "@/server/worker-auth";
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
import { sendJobNotification } from "@/features/delivery/infrastructure/telegram/telegram-delivery-adapter";
import { findTelegramUserIdForUser } from "@/features/telegram/repository/telegram-repository";

const VIDEO_MAX_SIZE_BYTES =
  FILE_KIND_RULES.find((rule) => rule.kind === "VIDEO")?.maxSizeBytes ?? 0;

/**
 * Accept a rendered result from the Worker (legacy `POST /jobs/:id/upload`;
 * docs/integrations/worker-api.md §6, Phase 9, ADR-0039). Called only from
 * `POST /api/v1/worker/jobs/:id/upload` (renamed from `.../result`,
 * ADR-0043 — matches the actual Worker's real endpoint path) — this
 * function itself takes no `Actor` (the Worker is never one,
 * docs/domain/jobs.md "Worker identity").
 *
 * **`RENDERED` is now the Job's final, successful completion state**
 * (ADR-0041 — Studio no longer uploads a rendered Job anywhere; there is no
 * `DELIVERING`/`UPLOADED` step after this). Once the atomic `RENDERING ->
 * RENDERED` transition below succeeds, this function's only remaining work
 * is a best-effort "rendered" notification — never another state
 * transition, and never an external delivery call.
 *
 * **Idempotent and race-safe** (docs/integrations/worker-api.md §5's
 * "duplicate Worker request" contract):
 *
 * 1. A Job not currently `RENDERING`/`RENDERED` that already has a
 *    `videoFileId` is a **duplicate** of an already-accepted result —
 *    returned as-is, no reprocessing.
 * 2. A Job not currently `RENDERING`/`RENDERED` with no `videoFileId` is a
 *    genuine error (wrong state to accept a result at all).
 * 3. Two concurrent requests that both observe an acceptable state both do
 *    the (wasted, but harmless) media-processing work; only one wins the
 *    atomic conditional update. The loser rolls back its own just-created
 *    artifacts and re-reads the Job — if the winner's result is now visible
 *    (`videoFileId` set), that is returned instead of erroring; a Job in a
 *    state neither of the two `Worker`s expected is a real conflict.
 *
 * **Also accepts a Job already in `RENDERED` with no `videoFileId` yet —
 * revised, ADR-0043.** The actual Worker
 * (`navaak-ae-renderer/renderer/renderer.go`'s `next()`) calls
 * `ChangeState(Rendered)` (a bare `PATCH .../state`) **before** uploading
 * the result — by the time the upload request arrives, `RENDERING ->
 * RENDERED` has often already happened via that separate call, with no
 * artifact attached yet. Requiring `RENDERING` strictly here (the
 * originally documented design) rejects every real upload with a
 * `business_rule` error, since the Job is already `RENDERED` by then. This
 * function's own atomic conditional update uses `[job.state]` as the
 * `fromStates` set — `RENDERED -> RENDERED` (attaching the artifact ids) is
 * exactly as safe as `RENDERING -> RENDERED`, since both are a single
 * conditional `UPDATE ... WHERE state = <job.state actually observed>`.
 */
export async function acceptJobResult(
  jobId: string,
  videoBuffer: Buffer,
  /**
   * `null` means "no Worker credential was presented" — the actual Worker's
   * upload call (`navaak-ae-renderer/renderer/operator/upload.go`'s
   * `UploadJob`) sends no `Authorization` header at all, unlike every other
   * Worker request (ADR-0043; see `POST .../jobs/:id/upload`'s route doc
   * comment for the compensating checks this implies). A non-null array is
   * enforced exactly as before.
   */
  allowedDepartmentIds: readonly string[] | null,
): Promise<SafeJobDetail> {
  const job = await findJobById(jobId);
  if (!job) throw notFoundError();
  if (allowedDepartmentIds) {
    assertWorkerDepartmentAccess(allowedDepartmentIds, job.departmentId);
  }

  const canAcceptFromCurrentState =
    job.state === "RENDERING" || (job.state === "RENDERED" && !job.videoFileId);

  if (!canAcceptFromCurrentState) {
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

  const updated = await transitionJobRow(jobId, [job.state], "RENDERED", {
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

  await notifyRendered(updated);
  return updated;
}

/** Best-effort, never a Job-state failure (matches legacy — a failed
 * Telegram DM was logged only, never surfaced or retried). */
async function notifyRendered(job: SafeJobDetail): Promise<void> {
  const telegramUserId = await findTelegramUserIdForUser(job.createdByUserId);
  if (!telegramUserId) return;
  await sendJobNotification(
    telegramUserId,
    `"${job.title}" rendered successfully.`,
  );
}
