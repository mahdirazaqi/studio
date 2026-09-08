import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { JobState } from "@/features/jobs/domain/job";

/**
 * The one centralized Job status → label/color mapping (Phase 15) — Jobs
 * List and Job Detail both render this component, never a per-page color
 * choice (docs/domain/jobs.md "Job status chips"). Only the 6 states the
 * current state machine actually has (`job-state-machine.ts`) — no
 * `Uploading`/`Uploaded`, removed with YouTube upload (ADR-0041); do not
 * reintroduce them here either.
 *
 * Uses the existing `--success`/`--warning`/`--info` semantic tokens
 * (`globals.css`, already theme-aware in both Light and Dark — just
 * previously unused anywhere) alongside the Badge component's existing
 * `default`/`destructive`/`outline` variants — no new color is invented.
 * Each state keeps a distinct **text label** too (`STATE_LABEL`), so status
 * is never communicated by color alone.
 */
const STATE_LABEL: Record<JobState, string> = {
  QUEUED: "Queued",
  CLAIMED: "Claimed",
  RENDERING: "Rendering",
  RENDERED: "Rendered",
  ERROR: "Error",
  CANCELED: "Canceled",
};

/** Semantic intent per state: neutral (queued/canceled) / info (claimed) /
 * active (rendering) / success (rendered) / destructive (error). Rendered
 * via the same `bg-{color}/10 text-{color} border-{color}/30` treatment
 * this codebase already uses for inline alerts (e.g. form error banners) —
 * not a new visual language. */
const STATE_CLASS: Record<JobState, string> = {
  QUEUED: "border-border text-muted-foreground bg-muted",
  CLAIMED: "border-info/30 text-info bg-info/10",
  RENDERING: "border-warning/30 text-warning bg-warning/10",
  RENDERED: "border-success/30 text-success bg-success/10",
  ERROR: "border-destructive/30 text-destructive bg-destructive/10",
  CANCELED: "border-border text-muted-foreground bg-muted",
};

export function JobStatusBadge({
  state,
  className,
}: {
  state: JobState;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", STATE_CLASS[state], className)}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STATE_LABEL[state]}
    </Badge>
  );
}
