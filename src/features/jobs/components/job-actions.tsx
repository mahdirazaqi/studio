"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cancelJobAction } from "@/features/jobs/actions/cancel-job.action";
import { retryJobAction } from "@/features/jobs/actions/retry-job.action";
import { retryJobDeliveryAction } from "@/features/delivery/actions/retry-job-delivery.action";
import {
  canCancelFromState,
  canRetryFromState,
} from "@/features/jobs/domain/job-state-machine";
import type { JobState } from "@/features/jobs/domain/job";

/**
 * Cancel/Retry — the only two operator-triggered state changes
 * (docs/domain/jobs.md "Cancellation"/"Retry"). Never sets state directly
 * (Phase 6 brief §36) — both go through a Server Action into the
 * authorized, state-machine-validated use case. Visibility here
 * (`canCancelFromState`/`canRetryFromState`) is a rendering choice only; the
 * use case re-checks independently regardless of what got rendered.
 */
export function JobActions({
  jobId,
  jobTitle,
  state,
  canRetryDelivery = false,
  size = "default",
}: {
  jobId: string;
  jobTitle: string;
  state: JobState;
  /** `true` only when the job errored with an already-rendered video still
   * available and YouTube delivery configured (Phase 9,
   * `features/delivery/use-cases/retry-job-delivery.ts` re-validates this
   * independently regardless of what got rendered here). */
  canRetryDelivery?: boolean;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    if (!window.confirm(`Cancel "${jobTitle}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await cancelJobAction({ jobId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`"${jobTitle}" canceled.`);
      router.refresh();
    });
  }

  function handleRetry() {
    if (!window.confirm(`Retry "${jobTitle}"? This creates a new job.`)) return;
    startTransition(async () => {
      const result = await retryJobAction({ jobId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Retry created: "${result.data.title}".`);
      router.push(`/jobs/${result.data.id}`);
      router.refresh();
    });
  }

  function handleRetryDelivery() {
    if (
      !window.confirm(
        `Retry YouTube delivery for "${jobTitle}"? This does not re-render the job.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await retryJobDeliveryAction({ jobId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Delivery retried for "${jobTitle}".`);
      router.refresh();
    });
  }

  const canCancel = canCancelFromState(state);
  const canRetry = canRetryFromState(state);
  if (!canCancel && !canRetry && !canRetryDelivery) return null;

  return (
    <div className="flex items-center gap-2">
      {canRetryDelivery ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={isPending}
          onClick={handleRetryDelivery}
        >
          <RotateCw /> Retry delivery
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={isPending}
          onClick={handleCancel}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <XCircle /> Cancel
        </Button>
      ) : null}
      {canRetry ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={isPending}
          onClick={handleRetry}
        >
          <RotateCw /> Retry
        </Button>
      ) : null}
    </div>
  );
}
