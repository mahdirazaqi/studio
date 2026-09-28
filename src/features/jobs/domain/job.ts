/**
 * Pure domain types for the Job feature. No I/O, no Prisma import — mirrors
 * `features/templates/domain/template.ts`.
 */

export const JOB_STATES = [
  "QUEUED",
  "CLAIMED",
  "RENDERING",
  "RENDERED",
  "ERROR",
  "CANCELED",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const JOB_ASSET_KINDS = [
  "DATA",
  "IMAGE",
  "AUDIO",
  "VIDEO",
  "SCRIPT",
] as const;
export type JobAssetKind = (typeof JOB_ASSET_KINDS)[number];

export interface SafeJobAsset {
  id: string;
  slotKey: string | null;
  kind: JobAssetKind;
  composition: string | null;
  layer: string | null;
  textValue: string | null;
  fileId: string | null;
  fileOriginalName: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  fileWidth: number | null;
  fileHeight: number | null;
  order: number;
}

/**
 * List-view shape — no assets/snapshot, cheap to page through.
 *
 * **`startedAt`/`renderedAt`/`thumbnailFileId` are included here — Phase 15
 * — not detail-only**, so the Jobs List can show a thumbnail, render time,
 * and video duration per row without a second per-row query
 * (docs/domain/jobs.md "Video duration & render time"). **`videoFileId`/
 * `screenshotFileId` too, since Phase 21** — the Jobs List download action
 * needs both per row (docs/domain/jobs.md "Output & thumbnail download");
 * each is the same plain string column `thumbnailFileId` already was, not a
 * join, so this costs nothing extra per row.
 */
export interface SafeJob {
  id: string;
  departmentId: string;
  templateId: string;
  templateName: string;
  title: string;
  state: JobState;
  progress: number | null;
  /** Rendered **video's own** duration in seconds, reported by the Worker
   * (`Job.durationSeconds`) — not to be confused with render time (how long
   * Studio took to produce it, see `computeRenderSeconds`). `null` until
   * reported. */
  durationSeconds: number | null;
  retryOfJobId: string | null;
  attemptNumber: number;
  createdByUserId: string;
  createdByName: string | null;
  errorReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Set once, the first time this Job's state actually enters `RENDERING`
   * (`transitionJobForWorker`, Phase 15/ADR-0045) — `null` before that.
   * Deliberately **not** `claimedAt`: the gap between claim and the Worker
   * actually starting to render (asset download time) is not render time. */
  startedAt: Date | null;
  /** Set once, atomically with the `RENDERING -> RENDERED` transition
   * (`accept-job-result.ts`) — `null` until the Job successfully renders. */
  renderedAt: Date | null;
  /** A small (150px-height) `JOB_ARTIFACT` image generated via `ffmpeg` from
   * the rendered video (Phase 9, `generate-render-artifacts.ts`) — `null`
   * until the Job successfully renders. Servable at `/api/files/{id}`
   * exactly like any other File. **Display use only** — this is a
   * deliberately downscaled preview image
   * (`resizeImageToHeight(screenshotPath, thumbnailPath, 150)`); see
   * `screenshotFileId` for the full-resolution version of the same frame.
   * Never used as a download source (Phase 21/ADR-0053 — downloading this
   * one produced a visibly low-quality image). */
  thumbnailFileId: string | null;
  /** The full rendered result (Phase 9) — `null` until a Worker successfully
   * posts a result. `RENDERED` is the Job's final, successful completion
   * state (ADR-0041) — there is no further delivery step after this is set.
   * Servable/downloadable at `/api/files/{id}` exactly like any other File
   * (Phase 21 — the Jobs List download action). */
  videoFileId: string | null;
  /** The **full-resolution** frame `generate-render-artifacts.ts` extracts
   * directly from the rendered video via `ffmpeg` (`extractVideoFrame`,
   * `-q:v 2`) — before it gets downscaled into `thumbnailFileId`. `null`
   * until the Job successfully renders. **This, not `thumbnailFileId`, is
   * the correct download source for "download the thumbnail at full
   * quality"** (Phase 21/ADR-0053) — the Job Card's own small preview image
   * still uses `thumbnailFileId` (fast to load, fine for a card), but a
   * download must give the user the real, undownscaled image. */
  screenshotFileId: string | null;
}

/** Detail-view shape — full snapshot, assets, timeline, retry/cancel metadata. */
export interface SafeJobDetail extends SafeJob {
  snapshot: JobSnapshot;
  assets: SafeJobAsset[];
  retriedByUserId: string | null;
  retriedByName: string | null;
  retryReason: string | null;
  canceledByUserId: string | null;
  canceledByName: string | null;
  canceledAt: Date | null;
  cancelReason: string | null;
  claimedAt: Date | null;
}

/**
 * The actual **rendering period** — `startedAt` to `renderedAt` — as opposed
 * to the video's own duration (`durationSeconds`) or the Job's total
 * lifetime including queue wait (`createdAt` to `renderedAt`, deliberately
 * *not* used here). Returns `null` whenever either timestamp is missing
 * (not yet started, not yet rendered) or the pair is inconsistent
 * (`renderedAt` before `startedAt` — defensive, should never happen given
 * the state machine, but never surfaced as a negative duration).
 */
export function computeRenderSeconds(
  startedAt: Date | null,
  renderedAt: Date | null,
): number | null {
  if (!startedAt || !renderedAt) return null;
  const seconds = Math.round(
    (renderedAt.getTime() - startedAt.getTime()) / 1000,
  );
  return seconds >= 0 ? seconds : null;
}

/**
 * Normalizes `Job.progress` for display (`features/jobs/components/
 * job-render-progress.tsx`, Phase 16) — a **presentation-layer clamp only**,
 * never a mutation of the stored value (`updateJobProgressSchema` already
 * enforces `0..100` at the Worker boundary, so this is purely defensive: a
 * `null` pre-first-report value becomes `0`, not `NaN`/a crash, and any
 * theoretically out-of-range value is clamped rather than rendered as-is).
 */
export function clampJobProgress(progress: number | null): number {
  if (progress === null || !Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

/**
 * The user-facing download filename for a Job's rendered output/thumbnail
 * (Phase 21, docs/domain/jobs.md "Output & thumbnail download") — never the
 * internal `File.storedName`/`storageKey` (those stay server-only,
 * docs/architecture/files.md). Built from the Job's own title, not the
 * artifact File's `originalName` (which is a generic, system-assigned name
 * — `generate-render-artifacts.ts` names them `render-<id>.mp4`/
 * `thumbnail-<id>.jpg` — meaningful only as a storage record, not something
 * a user should ever see in a "Save As" dialog).
 *
 * The extension is a fixed `.mp4`/`.jpg` on purpose, not derived from the
 * File's stored `mimeType` — `generate-render-artifacts.ts`'s `ffmpeg`
 * pipeline only ever produces exactly these two formats for a Job's video
 * and thumbnail today, so there is nothing to look up. If that pipeline
 * ever changes format, update both places together.
 */
export function buildJobDownloadFilename(
  title: string,
  kind: "video" | "thumbnail",
): string {
  const safeTitle = sanitizeForFilename(title) || "job";
  return kind === "video" ? `${safeTitle}.mp4` : `${safeTitle}-thumbnail.jpg`;
}

/**
 * Turns arbitrary Job-title text into a filesystem-safe base name: strips
 * characters illegal on Windows/macOS/Linux (`<>:"/\|?*` and control
 * characters — matches `sanitizeFilenameSegment`'s reasoning in
 * `src/app/api/v1/worker/_lib/build-file-url.ts`, a different call site
 * with the same underlying concern), collapses runs of whitespace, trims,
 * and caps the length so a very long title can't produce an unwieldy
 * filename. Never throws, never returns something containing `/`/`\` (so it
 * can never be misread as a path) — an all-punctuation or empty title
 * reduces to `""`, and the caller (`buildJobDownloadFilename`) falls back to
 * `"job"` rather than producing an empty filename.
 */
function sanitizeForFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100)
    .trim();
}

/**
 * The immutable, Template-level half of a Job's historical snapshot
 * (ADR-0028) — written once at creation, in `Job.snapshot` (JSONB). The
 * per-slot *resolved* values are `JobAsset` rows, not part of this shape.
 */
export interface JobSnapshotAssetSlot {
  key: string;
  kind: "DATA" | "IMAGE" | "AUDIO" | "VIDEO";
  composition: string;
  layer: string;
  imageRatio: "PORTRAIT_9_16" | "LANDSCAPE_16_9" | "SQUARE" | "ANY" | null;
}

export interface JobSnapshot {
  templateId: string;
  templateName: string;
  composition: string;
  source: string;
  scriptRef: string;
  outputPattern: string;
  assetSlotDefinitions: JobSnapshotAssetSlot[];
}
