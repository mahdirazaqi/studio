import { Clapperboard } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDurationHHMMSS } from "@/lib/format-duration";

/**
 * A Job's visual thumbnail — Jobs List (small) and Job Detail (large) both
 * render this, never a separately-styled per-page `<img>` (Phase 15,
 * docs/domain/jobs.md "Job thumbnail"). Reuses the existing File-serving
 * route exactly like `FileCard`'s image preview
 * (`features/files/components/file-card.tsx`) — no new storage/media
 * pipeline; `thumbnailFileId` is the small (150px-height) `JOB_ARTIFACT`
 * image `generate-render-artifacts.ts` already creates when a Job renders.
 *
 * **Before render completion** (`thumbnailFileId` is `null` — Queued/
 * Claimed/Rendering/Error/Canceled all reach here identically): a
 * consistent placeholder, not an empty area — a muted panel with a
 * `Clapperboard` icon, matching `FileCard`'s own placeholder-icon pattern
 * for non-image kinds. No new image asset was added
 * (CLAUDE.md §12 — do not build ahead of a real requirement).
 */
export function JobThumbnail({
  thumbnailFileId,
  durationSeconds,
  className,
}: {
  thumbnailFileId: string | null;
  /** Rendered video duration, shown as an `HH:MM:SS` overlay when known. */
  durationSeconds?: number | null;
  className?: string;
}) {
  const durationLabel =
    durationSeconds != null ? formatDurationHHMMSS(durationSeconds) : null;

  return (
    <div
      className={cn(
        "bg-muted relative aspect-video shrink-0 overflow-hidden rounded-md",
        className,
      )}
    >
      {thumbnailFileId ? (
        // Authenticated route only — see docs/architecture/files.md.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${thumbnailFileId}`}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label="No rendered preview yet"
          className="text-muted-foreground flex size-full items-center justify-center"
        >
          <Clapperboard className="size-8 opacity-40" />
        </div>
      )}

      {durationLabel ? (
        // A fixed dark overlay, not a theme token, is deliberate here: it
        // sits on top of unpredictable thumbnail image content (arbitrary
        // rendered video frames), not the page background — the same
        // reasoning a video player's own duration badge uses regardless of
        // site theme. Guaranteed contrast > theme consistency for this one
        // small, purely informational label.
        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white">
          {durationLabel}
        </span>
      ) : null}
    </div>
  );
}
