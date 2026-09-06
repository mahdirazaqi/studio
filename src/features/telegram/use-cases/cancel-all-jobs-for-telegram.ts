import type { Actor } from "@/server/authz";
import { AppError } from "@/server/errors/app-error";
import { CANCELABLE_STATES } from "@/features/jobs/domain/job-state-machine";
import { cancelJob } from "@/features/jobs/use-cases/cancel-job";
import { listDepartmentJobs } from "@/features/jobs/use-cases/list-jobs";

/**
 * One page per cancelable state, not a full paginated sweep — deliberately
 * bounded rather than looping through pages while rows are being mutated
 * out from under the same filter (a canceled Job leaves the "cancelable"
 * set mid-loop, which would shift a naive page-2/page-3 offset). A
 * department with more than 100 simultaneously cancelable Jobs in one state
 * is far beyond normal interactive Telegram use; this is an accepted bound,
 * not an attempt at an exhaustive bulk operation.
 */
const PAGE_SIZE = 100;

export interface CancelAllJobsResult {
  canceledCount: number;
  failedCount: number;
}

/**
 * The Telegram "🔴 Cancel All Jobs" flow (Phase 8 brief §11 — a **direct**
 * fix for a real legacy security bug, not just a UX flow): legacy's
 * `cancelAllJobs` had **no owner or scope filter at all** — any linked
 * Telegram user could cancel every non-terminal Job in the entire system,
 * across every workspace. Studio's version cancels only Jobs the calling
 * `Actor` is authorized to cancel, and — because `job:manage` is
 * whole-department (OD-03) rather than creator-only — that means "every
 * cancelable Job in the actor's own Department", never system-wide.
 *
 * This is **not** a new Jobs-feature bulk-cancel capability (`CLAUDE.md`
 * §11 explicitly defers that) — it is a Telegram-adapter-level composition
 * of the existing single-Job `cancelJob` use case, called once per eligible
 * Job, each independently authorized and state-checked exactly as if a
 * human had tapped "Cancel" on each one from the dashboard. No new Job-
 * domain logic is written here (Phase 8 brief §66).
 */
export async function cancelAllJobsForTelegram(
  actor: Actor,
): Promise<CancelAllJobsResult> {
  let canceledCount = 0;
  let failedCount = 0;

  for (const state of CANCELABLE_STATES) {
    const result = await listDepartmentJobs(actor, {
      state,
      page: 1,
      pageSize: PAGE_SIZE,
    });
    for (const job of result.items) {
      try {
        await cancelJob(
          actor,
          job.id,
          "Canceled via Telegram (Cancel All Jobs)",
        );
        canceledCount++;
      } catch (error) {
        // A job that raced into a non-cancelable state between the list and
        // the cancel attempt is not a bug — `cancelJob` itself is the source
        // of truth; this loop just counts it and moves on.
        if (!AppError.isAppError(error)) throw error;
        failedCount++;
      }
    }
  }

  return { canceledCount, failedCount };
}
