import Link from "next/link";
import { RotateCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDurationHHMMSS } from "@/lib/format-duration";
import { computeRenderSeconds, type SafeJob } from "@/features/jobs/domain/job";
import { JobActions } from "@/features/jobs/components/job-actions";
import { JobRenderProgress } from "@/features/jobs/components/job-render-progress";
import { JobStatusBadge } from "@/features/jobs/components/job-status-badge";
import { JobThumbnail } from "@/features/jobs/components/job-thumbnail";

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
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/jobs/${job.id}`}
                className="truncate font-medium hover:underline"
              >
                {job.title || "(untitled)"}
              </Link>
              <JobStatusBadge state={job.state} />
              {job.retryOfJobId ? (
                <Badge variant="outline" className="gap-1">
                  <RotateCw className="size-3" /> Retry #{job.attemptNumber}
                </Badge>
              ) : null}
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>Template: {job.templateName}</span>
              {job.createdByName ? <span>By {job.createdByName}</span> : null}
              <span>
                Render time:{" "}
                <span className="font-mono">
                  {formatDurationHHMMSS(renderSeconds)}
                </span>
              </span>
            </div>
            {job.state === "RENDERING" ? (
              <JobRenderProgress progress={job.progress} className="max-w-xs" />
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
