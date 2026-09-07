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

/** List-view shape — no assets/snapshot, cheap to page through. */
export interface SafeJob {
  id: string;
  departmentId: string;
  templateId: string;
  templateName: string;
  title: string;
  state: JobState;
  progress: number | null;
  durationSeconds: number | null;
  retryOfJobId: string | null;
  attemptNumber: number;
  createdByUserId: string;
  createdByName: string | null;
  errorReason: string | null;
  createdAt: Date;
  updatedAt: Date;
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
  startedAt: Date | null;
  renderedAt: Date | null;
  /** The rendered result and its derived images (Phase 9) — `null` until a
   * Worker successfully posts a result. `RENDERED` is the Job's final,
   * successful completion state (ADR-0041) — there is no further delivery
   * step after these are set. */
  videoFileId: string | null;
  screenshotFileId: string | null;
  thumbnailFileId: string | null;
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
