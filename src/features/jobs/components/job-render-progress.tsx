import { Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { clampJobProgress } from "@/features/jobs/domain/job";

/**
 * The "this Job is actively rendering" treatment — one shared, centralized
 * presentation for every place that needs it (mirrors `JobStatusBadge` being
 * the one state → visual mapping — never a second, competing one). Two
 * variants of the *same* underlying pieces (`clampJobProgress`, the shared
 * `Progress` primitive, the `--warning` token `JobStatusBadge` already uses
 * for `RENDERING`), not two components:
 *
 * - `compact` (default) — Jobs List row (`job-list-item.tsx`). A minimal
 *   `Rendering · 67%` label over a hairline bar, rendered **alongside** the
 *   Template/By/Render-time metadata line (which stays visible in every
 *   state, rendering included — Jobs List brief §6), never in place of it —
 *   kept deliberately small (no icon, no border/padding box) so this one
 *   extra line never makes a rendering Job's card *significantly* taller
 *   than a completed one's.
 * - `full` — the Job Detail page's Status card (Phase 16 brief), where a
 *   larger, bordered treatment is appropriate.
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
 */
export function JobRenderProgress({
  progress,
  variant = "full",
  className,
}: {
  /** `Job.progress`, 0–100 — or `null` before the Worker's first report. */
  progress: number | null;
  variant?: "full" | "compact";
  className?: string;
}) {
  const clamped = clampJobProgress(progress);

  if (variant === "compact") {
    return (
      <div className={cn("space-y-1", className)}>
        <span className="text-warning block text-xs font-medium">
          Rendering ·{" "}
          <span className="font-semibold tabular-nums">{clamped}%</span>
        </span>
        <Progress
          value={clamped}
          aria-label="Render progress"
          className="bg-warning/20 h-1"
          indicatorClassName="bg-warning motion-reduce:transition-none"
        />
      </div>
    );
  }

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
