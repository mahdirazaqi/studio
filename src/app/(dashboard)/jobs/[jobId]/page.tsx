import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { ForbiddenPage } from "@/components/layout/forbidden-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/current-user";
import { toActor } from "@/server/authz";
import { AppError } from "@/server/errors/app-error";
import { formatDurationHHMMSS } from "@/lib/format-duration";
import { getJob } from "@/features/jobs/use-cases/get-job";
import { JobActions } from "@/features/jobs/components/job-actions";
import { JobRenderProgress } from "@/features/jobs/components/job-render-progress";
import { JobStatusBadge } from "@/features/jobs/components/job-status-badge";
import { JobThumbnail } from "@/features/jobs/components/job-thumbnail";
import {
  computeRenderSeconds,
  type SafeJobAsset,
} from "@/features/jobs/domain/job";

export const metadata: Metadata = { title: "Job" };

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function assetValueLabel(asset: SafeJobAsset): string {
  if (asset.kind === "DATA" || asset.kind === "SCRIPT") {
    return asset.textValue ?? "—";
  }
  return asset.fileOriginalName
    ? `${asset.fileOriginalName}${asset.fileId ? "" : " (file deleted — media no longer stored)"}`
    : "(no file)";
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const user = await requireUser();
  const actor = toActor(user);

  // See docs/architecture/authorization.md "Server Component authorization"
  // for why this direct AppError catch exists — mirrors the Templates detail
  // page's own translation of not_found/forbidden into the right rendering.
  let job;
  try {
    job = await getJob(actor, jobId);
  } catch (error) {
    if (error instanceof AppError && error.kind === "not_found") notFound();
    if (error instanceof AppError && error.kind === "forbidden") {
      return <ForbiddenPage />;
    }
    throw error;
  }

  const renderSeconds = computeRenderSeconds(job.startedAt, job.renderedAt);

  return (
    <PageShell>
      <PageHeader
        title={job.title || "(untitled)"}
        description={`Template: ${job.snapshot.templateName}`}
        actions={
          <JobActions jobId={job.id} jobTitle={job.title} state={job.state} />
        }
      />

      <div className="space-y-6">
        <JobThumbnail
          thumbnailFileId={job.thumbnailFileId}
          // Duration overlay only once the rendered output actually exists
          // (Phase 16 brief §3) — never a stray mid-render report.
          durationSeconds={
            job.state === "RENDERED" ? job.durationSeconds : null
          }
          className="max-w-md"
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Status <JobStatusBadge state={job.state} />
              {job.retryOfJobId ? (
                <Badge variant="outline">Attempt {job.attemptNumber}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {job.state === "RENDERING" ? (
              <div className="sm:col-span-2">
                <JobRenderProgress progress={job.progress} />
              </div>
            ) : (
              <div>
                <span className="text-muted-foreground">Progress: </span>
                {job.progress !== null ? `${job.progress}%` : "—"}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Duration: </span>
              <span className="font-mono">
                {formatDurationHHMMSS(job.durationSeconds)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Render time: </span>
              <span className="font-mono">
                {formatDurationHHMMSS(renderSeconds)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Created by: </span>
              {job.createdByName ?? "—"}
            </div>
            {job.retryOfJobId ? (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Retry of: </span>
                <Link
                  href={`/jobs/${job.retryOfJobId}`}
                  className="hover:underline"
                >
                  {job.retryOfJobId}
                </Link>
                {job.retriedByName ? ` (by ${job.retriedByName})` : ""}
                {job.retryReason ? ` — "${job.retryReason}"` : ""}
              </div>
            ) : null}
            {job.state === "ERROR" && job.errorReason ? (
              <div className="text-destructive sm:col-span-2">
                <span className="text-muted-foreground">Error: </span>
                {job.errorReason}
              </div>
            ) : null}
            {job.state === "CANCELED" ? (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Canceled by: </span>
                {job.canceledByName ?? "—"}
                {job.cancelReason ? ` — "${job.cancelReason}"` : ""}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Created: </span>
              {formatDate(job.createdAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Claimed: </span>
              {formatDate(job.claimedAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Started: </span>
              {formatDate(job.startedAt)}
            </div>
            <div>
              <span className="text-muted-foreground">Rendered: </span>
              {formatDate(job.renderedAt)}
            </div>
          </CardContent>
        </Card>

        {job.videoFileId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rendered result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Video: </span>
                <a
                  href={`/api/files/${job.videoFileId}`}
                  className="hover:underline"
                >
                  Download
                </a>
                {job.thumbnailFileId ? (
                  <>
                    {" · "}
                    <a
                      href={`/api/files/${job.thumbnailFileId}`}
                      className="hover:underline"
                    >
                      Thumbnail
                    </a>
                  </>
                ) : null}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Template configuration (as it was at creation)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Composition: </span>
              {job.snapshot.composition}
            </p>
            <p>
              <span className="text-muted-foreground">Source: </span>
              {job.snapshot.source}
            </p>
            <p>
              <span className="text-muted-foreground">Output pattern: </span>
              {job.snapshot.outputPattern}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {job.assets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col gap-0.5 border-b pb-2 text-sm last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-muted-foreground">
                  {asset.slotKey ?? "(script)"} · {asset.kind.toLowerCase()}
                </span>
                <span className="truncate">{assetValueLabel(asset)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
