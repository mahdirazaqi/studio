import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import type {
  DeliveryProvider,
  DeliveryStatus,
} from "@/features/jobs/domain/job";

/**
 * The only module that writes the `DeliveryAttempt` table — reads happen
 * through `features/jobs/repository/job-repository.ts`'s own
 * `SafeJobDetail.deliveryAttempts` (already loaded, newest-attempt-first per
 * provider, alongside everything else a delivery use case needs about the
 * Job), so there is no separate "find the latest attempt" query duplicating
 * that join.
 */

/**
 * Commits a `PENDING` row **before** any external API call runs — the actual
 * durability guarantee (docs/integrations/youtube.md "Delivery reliability"):
 * a process crash between this insert and the provider call still leaves an
 * accurate, retryable record. The `(jobId, provider, attemptNumber)` unique
 * constraint turns a concurrent duplicate attempt at the same number into a
 * clean `conflict` rather than two rows describing the same attempt.
 */
export async function createPendingDeliveryAttempt(data: {
  jobId: string;
  provider: DeliveryProvider;
  attemptNumber: number;
  triggeredByUserId: string | null;
}): Promise<string> {
  try {
    const row = await db.deliveryAttempt.create({
      data: {
        jobId: data.jobId,
        provider: data.provider,
        attemptNumber: data.attemptNumber,
        triggeredByUserId: data.triggeredByUserId,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflictError(
        "A delivery attempt for this job/provider is already in progress.",
      );
    }
    throw error;
  }
}

export async function completeDeliveryAttempt(
  attemptId: string,
  result: {
    status: Extract<DeliveryStatus, "SUCCEEDED" | "FAILED">;
    providerRef?: string;
    failureReason?: string;
  },
): Promise<void> {
  await db.deliveryAttempt.update({
    where: { id: attemptId },
    data: {
      status: result.status,
      providerRef: result.providerRef,
      failureReason: result.failureReason,
      completedAt: new Date(),
    },
  });
}
