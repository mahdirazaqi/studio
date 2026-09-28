import { Download, ImageDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildJobDownloadFilename } from "@/features/jobs/domain/job";

/**
 * Compact icon-only download actions for a completed Job — added to the Jobs
 * List (Phase 21, docs/domain/jobs.md "Output & thumbnail download"). Its own
 * component, not inlined into `JobListItem`, so a future Job Detail download
 * UI (out of this phase's scope — Job Detail already has its own working
 * "Rendered result" download links) can reuse it instead of a second
 * implementation.
 *
 * Each is a plain `<a>` to the existing, unmodified, authenticated
 * `/api/files/[fileId]` route — the same route Job Detail's own "Rendered
 * result" card has always used. No new download endpoint, no client-side
 * fetch/blob handling: the browser downloads natively, so there is nothing
 * here to show a loading state for (a plain anchor click cannot be
 * "pending"). The `download` attribute (not the route's own
 * `Content-Disposition: inline`, ADR-0046) is what makes the browser save
 * rather than navigate, and its value is what actually determines the
 * saved filename — `buildJobDownloadFilename` overrides whatever the route
 * would otherwise suggest with a Job-title-based one.
 *
 * **The "thumbnail" download deliberately serves `screenshotFileId`, not
 * `thumbnailFileId` — corrected, Phase 21/ADR-0053.** `thumbnailFileId` is a
 * downscaled 150px-height preview (`generate-render-artifacts.ts`'s
 * `resizeImageToHeight`) — fine for a Job Card, but downloading it produced a
 * visibly low-quality image, which is exactly the bug this fixes.
 * `screenshotFileId` is the full-resolution frame `ffmpeg` extracted
 * directly from the rendered video, before that downscale — the actual
 * highest-quality still image Studio has. The button is still labeled
 * "thumbnail" (it's the same frame the user sees as the Job's thumbnail,
 * just not downscaled) — only which File id it points at changed.
 *
 * Renders only the actions whose file actually exists — never a disabled
 * button hinting at a download that would 404 (docs/domain/jobs.md — a Job
 * still `RENDERING`, or one that rendered without a thumbnail for some
 * reason, simply shows nothing here for that one action).
 */
export function JobDownloadActions({
  jobTitle,
  screenshotFileId,
  videoFileId,
  size = "icon-sm",
}: {
  jobTitle: string;
  /** The full-resolution frame — **not** `Job.thumbnailFileId` (see this
   * component's own doc comment for why). */
  screenshotFileId: string | null;
  videoFileId: string | null;
  size?: "icon-sm" | "icon";
}) {
  if (!screenshotFileId && !videoFileId) return null;

  return (
    <div className="flex items-center gap-1">
      {screenshotFileId ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size={size} asChild>
              <a
                href={`/api/files/${screenshotFileId}`}
                download={buildJobDownloadFilename(jobTitle, "thumbnail")}
                aria-label="Download thumbnail"
              >
                <ImageDown />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download thumbnail</TooltipContent>
        </Tooltip>
      ) : null}
      {videoFileId ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size={size} asChild>
              <a
                href={`/api/files/${videoFileId}`}
                download={buildJobDownloadFilename(jobTitle, "video")}
                aria-label="Download rendered video"
              >
                <Download />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download rendered video</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
