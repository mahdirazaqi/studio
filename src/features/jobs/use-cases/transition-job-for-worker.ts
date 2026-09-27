import { assertWorkerDepartmentAccess } from "@/server/worker-auth";
import { notFoundError, validationError } from "@/server/errors/app-error";
import { mapWorkerState } from "@/features/jobs/domain/legacy-state-mapping";
import { transitionJob } from "@/features/jobs/use-cases/transition-job";
import {
  findJobById,
  findJobState,
  markRenderStarted,
} from "@/features/jobs/repository/job-repository";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import type { WorkerTransitionInput } from "@/features/jobs/schemas/worker-transition.schema";

/**
 * Legacy per-stage codes that map to Studio's `RENDERING` but are reported
 * *before* the real Worker actually starts rendering
 * (`navaak-ae-renderer/renderer/renderer.go`'s `next()`, traced against the
 * real source, Phase 18/ADR-0048): `Downloading` (2) fires at the very
 * start of asset download, `Started` (3) fires after download completes but
 * before script generation. Only `InProgress` (4) — checked separately
 * below — fires immediately before the actual `aerender` invocation
 * (`operator/render.go`'s `Render()`). Used only to decide *when* to set
 * `Job.startedAt`, never to alter which Studio state a report maps to
 * (`mapWorkerState` alone still owns that).
 */
const PRE_RENDER_LEGACY_CODES: ReadonlySet<number> = new Set([2, 3]);
/** The legacy code for the real render-start moment — see above. */
const IN_PROGRESS_LEGACY_CODE = 4;

/** Used when the real Worker reports `ERROR` — see below — since it never
 * sends any error message/reason at all. Never shown as if it were the
 * Worker's own words; distinguishable from a genuine Worker-supplied
 * message. */
const NO_REASON_FROM_WORKER =
  "The Worker reported a render failure without providing a reason.";

/**
 * The Worker-facing adapter over `transitionJob` (Phase 6) — maps the
 * Worker's legacy-int-or-name `state` value. This is input *mapping*, not a
 * reimplementation of any state-machine rule: the actual transition
 * legality is still decided entirely by `transitionJob`/`isValidTransition`
 * (Phase 6 brief §4 — never duplicate that here).
 *
 * **`errorReason` is optional, not required — corrected, Phase 19/ADR-0049.**
 * The originally shipped design required it for a Worker-reported `ERROR`.
 * The real Worker (`navaak-ae-renderer/renderer/operator/request.go`'s
 * `ChangeState`) sends `PATCH .../state` with `{"state": s}` **only** — it
 * has no error-message concept anywhere in its source (verified: no
 * `reason`/`error` field is ever marshaled). Requiring one made every real
 * Worker-reported failure fail *again*, with a `validation` error, leaving
 * the Job stuck in whatever state it was already in — permanently, since a
 * Job already `RENDERED` (the real Worker's `next()` sequence changes state
 * to `Rendered` *before* uploading — ADR-0043) has no further outgoing
 * transition for a later, actually-successful `ERROR` report to use either.
 * A missing `errorReason` now falls back to `NO_REASON_FROM_WORKER` instead
 * of rejecting the transition outright.
 *
 * **Department-scoped (ADR-0040)**: `Job.departmentId` is immutable once
 * created (copied from the Template at Job-creation time, never re-derived
 * — see `docs/domain/templates.md` "Department transfer"), so a plain
 * pre-check against `allowedDepartmentIds` is race-free here — unlike the
 * claim query, there is no "which Job" selection for a concurrent Template
 * transfer to race against.
 */
export async function transitionJobForWorker(
  jobId: string,
  input: WorkerTransitionInput,
  allowedDepartmentIds: readonly string[],
): Promise<SafeJobDetail> {
  const current = await findJobState(jobId);
  if (!current) throw notFoundError();
  assertWorkerDepartmentAccess(allowedDepartmentIds, current.departmentId);

  const targetState = mapWorkerState(input.state);
  if (!targetState) {
    throw validationError(
      `Unknown state "${input.state}". Use a Studio state name (e.g. "RENDERING") or a legacy integer (0-9).`,
      { fieldErrors: { state: ["Unrecognized state value."] } },
    );
  }

  // Idempotent no-op — revised, ADR-0043. The actual Worker
  // (`navaak-ae-renderer/renderer/renderer.go`'s `next()`) reports THREE
  // distinct legacy per-stage codes in sequence while a Job is actively
  // rendering — Downloading(2), Started(3), InProgress(4) — and
  // `mapWorkerState` maps all three onto the same Studio `RENDERING`
  // bucket (`legacy-state-mapping.ts`). Only the first of the three is a
  // real `CLAIMED -> RENDERING` transition; the other two are same-state
  // reports. `isValidTransition`/`transitionJob`'s state machine
  // deliberately forbids a self-loop for every *other* caller (tested,
  // `job-state-machine.test.ts`) — that invariant is untouched. This is the
  // one Worker-facing boundary that treats "already in the reported state"
  // as success rather than a `business_rule` error, matching the existing
  // idempotent-no-op convention used elsewhere (Template enable/disable,
  // Template transfer, `acceptJobResult`'s duplicate-result handling).
  if (targetState === current.state) {
    // Phase 18/ADR-0048 — "InProgress" specifically still carries new
    // information even though the *state* itself is a no-op: it's the one
    // report that means rendering has actually started. Every real render
    // reaches this branch for it, since "Downloading"/"Started" (the
    // earlier same-bucket reports) already made the real CLAIMED ->
    // RENDERING transition below a no-op case by the time "InProgress"
    // arrives.
    const job =
      input.state === IN_PROGRESS_LEGACY_CODE
        ? await markRenderStarted(jobId)
        : await findJobById(jobId);
    if (!job) throw notFoundError();
    return job;
  }

  // Render time (Phase 15/ADR-0045, corrected Phase 18/ADR-0048):
  // `startedAt` must reflect when the Worker actually *started rendering*,
  // not merely "entered the RENDERING bucket" — those are different moments
  // for the real Worker. If this real transition was itself triggered by
  // "Downloading" or "Started" (`PRE_RENDER_LEGACY_CODES` — both fire
  // before any rendering work begins), `startedAt` is deliberately left
  // unset here; `markRenderStarted` sets it later, when the same Job's
  // subsequent "InProgress" report reaches the no-op branch above. Only set
  // it immediately when there's no finer-grained signal still to come: the
  // transition was triggered by "InProgress" itself (an edge case — an
  // earlier report was lost) or by a non-legacy caller sending the
  // canonical name "RENDERING" directly (no per-stage code to wait for).
  const targetIsRenderingFromKnownPreRenderCode =
    targetState === "RENDERING" &&
    typeof input.state === "number" &&
    PRE_RENDER_LEGACY_CODES.has(input.state);

  return transitionJob(jobId, targetState, {
    ...(targetState === "ERROR"
      ? { errorReason: input.errorReason ?? NO_REASON_FROM_WORKER }
      : {}),
    ...(targetState === "RENDERING" && !targetIsRenderingFromKnownPreRenderCode
      ? { startedAt: new Date() }
      : {}),
  });
}
