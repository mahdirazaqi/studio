import { Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { clampJobProgress } from "@/features/jobs/domain/job";

/**
 * The "this Job is actively rendering" treatment — one shared component for
 * both the Jobs List row (`job-list-item.tsx`) and the Job Detail page,
 * never a per-page rebuild of the same UI (Phase 16 brief §14, mirrors
 * `JobStatusBadge` being the one centralized state → presentation mapping).
 *
 * Callers render this **only** when `job.state === "RENDERING"` — the
 * existing state-machine's own notion of "actively rendering" (the Worker's
 * three legacy per-stage codes all map to this one Studio state,
 * `legacy-state-mapping.ts`), not merely "a progress value happens to
 * exist" (`Job.progress` can technically be set outside `RENDERING` too —
 * `update-job-progress.ts` only rejects updates once a Job reaches a
 * terminal state). That gating decision belongs to the caller, which already
 * has the Job's `state`; this component only renders the visual, given a
 * progress number.
 *
 * Reuses the existing `--warning` semantic token — the same one
 * `JobStatusBadge` already uses for `RENDERING` — via the same
 * `border-{color}/30 bg-{color}/10 text-{color}` treatment this codebase's
 * inline alerts already use elsewhere, so this reads as "the same active
 * state" wherever it appears, not a new color language.
 */
export function JobRenderProgress({
  progress,
  className,
}: {
  /** `Job.progress`, 0–100 — or `null` before the Worker's first report. */
  progress: number | null;
  className?: string;
}) {
  const clamped = clampJobProgress(progress);

  return (
    <div
      className={cn(
        "border-warning/30 bg-warning/10 space-y-2 rounded-md border p-2.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-warning flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <Loader2
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          />
          Rendering
        </span>
        <span className="text-warning shrink-0 text-base font-semibold tabular-nums">
          {clamped}%
        </span>
      </div>
      <Progress
        value={clamped}
        aria-label="Render progress"
        className="bg-warning/20 h-2"
        indicatorClassName="bg-warning transition-[transform] motion-reduce:transition-none"
      />
    </div>
  );
}
