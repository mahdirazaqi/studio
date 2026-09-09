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
 * (docs/domain/jobs.md "Video duration & render time"). `videoFileId`/
 * `screenshotFileId` stay detail-only — the list only ever needs the small
 * `thumbnailFileId` image, not the full video or the larger screenshot.
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
   * exactly like any other File. */
  thumbnailFileId: string | null;
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
  /** The rendered result and its derived images (Phase 9) — `null` until a
   * Worker successfully posts a result. `RENDERED` is the Job's final,
   * successful completion state (ADR-0041) — there is no further delivery
   * step after these are set. */
  videoFileId: string | null;
  screenshotFileId: string | null;
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
