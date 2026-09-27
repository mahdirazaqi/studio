import Link from "next/link";
import {
  Clock,
  LayoutTemplate,
  RotateCw,
  User,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDurationHHMMSS } from "@/lib/format-duration";
import { computeRenderSeconds, type SafeJob } from "@/features/jobs/domain/job";
import { JobActions } from "@/features/jobs/components/job-actions";
import { JobRenderProgress } from "@/features/jobs/components/job-render-progress";
import { JobStatusBadge } from "@/features/jobs/components/job-status-badge";
import { JobThumbnail } from "@/features/jobs/components/job-thumbnail";

/**
 * One `[icon] value` metadata item — replaces a textual `Label: value`
 * pair (Jobs List brief §2) without dropping the information itself: the
 * icon is `aria-hidden` and an `sr-only` label carries the same accessible
 * name a screen reader would have gotten from the removed text, and the
 * native `title` attribute gives sighted users an on-hover tooltip without
 * pulling in the Radix `Tooltip` primitive for three items on every row.
 */
function MetaItem({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      title={label}
      className={cn("inline-flex min-w-0 items-center gap-1", className)}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">{label}: </span>
      <span className="truncate">{value}</span>
    </span>
  );
}

/** Server Component row — the only interactive piece is `JobActions`. */
export function JobListItem({ job }: { job: SafeJob }) {
  const renderSeconds = computeRenderSeconds(job.startedAt, job.renderedAt);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/jobs/${job.id}`} className="shrink-0">
            <JobThumbnail
              thumbnailFileId={job.thumbnailFileId}
              // Duration overlay only for a Job whose rendered output is
              // actually available (Phase 16 brief §3) — never a stray
              // `Job.durationSeconds` the Worker reported mid-render.
              durationSeconds={
                job.state === "RENDERED" ? job.durationSeconds : null
              }
              className="w-28 sm:w-32"
            />
          </Link>

          <div className="min-w-0 space-y-1.5">
            {/* No `flex-wrap` here — the title must shrink (`min-w-0
                flex-1` + `truncate`), never wrap the row, so an arbitrarily
                long title can never push the status/retry chips out of the
                header or overflow the card (Jobs List brief §11–13). */}
            <div className="flex items-center gap-2">
              <Link
                href={`/jobs/${job.id}`}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {job.title || "(untitled)"}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <JobStatusBadge state={job.state} />
                {job.retryOfJobId ? (
                  <Badge variant="outline" className="gap-1">
                    <RotateCw className="size-3" /> Retry #{job.attemptNumber}
                  </Badge>
                ) : null}
              </div>
            </div>

            {/* Metadata is always visible, rendering or not (Jobs List
                brief §6) — icons replace the old `Label:` text, the values
                are unchanged. */}
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <MetaItem
                icon={LayoutTemplate}
                label="Template"
                value={job.templateName}
              />
              {job.createdByName ? (
                <MetaItem
                  icon={User}
                  label="Created by"
                  value={job.createdByName}
                />
              ) : null}
              <MetaItem
                icon={Clock}
                label="Render time"
                value={formatDurationHHMMSS(renderSeconds)}
                className="font-mono"
              />
            </div>

            {job.state === "RENDERING" ? (
              <JobRenderProgress
                progress={job.progress}
                variant="compact"
                className="max-w-56"
              />
            ) : null}

            {job.state === "ERROR" && job.errorReason ? (
              <p className="text-destructive text-xs">{job.errorReason}</p>
            ) : null}
          </div>
        </div>

        <JobActions
          jobId={job.id}
          jobTitle={job.title || "(untitled)"}
          state={job.state}
          size="sm"
        />
      </CardContent>
    </Card>
  );
}
