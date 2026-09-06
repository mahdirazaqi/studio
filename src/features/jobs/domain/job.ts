/**
 * Pure domain types for the Job feature. No I/O, no Prisma import — mirrors
 * `features/templates/domain/template.ts`.
 */

export const JOB_STATES = [
  "QUEUED",
  "CLAIMED",
  "RENDERING",
  "RENDERED",
  "DELIVERING",
  "UPLOADED",
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
  deliverToYouTube: boolean;
  retryOfJobId: string | null;
  attemptNumber: number;
  createdByUserId: string;
  createdByName: string | null;
  errorReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DELIVERY_PROVIDERS = ["TELEGRAM", "YOUTUBE"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

export const DELIVERY_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** One row of `docs/integrations/youtube.md`/`docs/integrations/telegram.md`
 * "Delivery" history for a Job (Phase 9). */
export interface SafeDeliveryAttempt {
  id: string;
  provider: DeliveryProvider;
  status: DeliveryStatus;
  attemptNumber: number;
  providerRef: string | null;
  failureReason: string | null;
  triggeredByUserId: string | null;
  startedAt: Date;
  completedAt: Date | null;
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
  deliveredAt: Date | null;
  uploadedAt: Date | null;
  /** The rendered result and its derived images (Phase 9) — `null` until a
   * Worker successfully posts a result. */
  videoFileId: string | null;
  screenshotFileId: string | null;
  thumbnailFileId: string | null;
  /** Newest first. Empty until the first automatic post-render delivery attempt. */
  deliveryAttempts: SafeDeliveryAttempt[];
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

/** Identity of the YouTube Target a Job was configured to deliver to, captured
 * at creation time (Phase 9) — never re-resolved from the live `Template`/
 * `YouTubeTarget` rows, so a later disconnect/rename never rewrites a
 * historical Job's own story. `null` when the Job was created without
 * `deliverToYouTube`, or its Template had no Target configured. */
export interface JobSnapshotYouTubeTarget {
  id: string;
  name: string;
  youtubeChannelId: string;
}

export interface JobSnapshot {
  templateId: string;
  templateName: string;
  composition: string;
  source: string;
  scriptRef: string;
  outputPattern: string;
  description: string | null;
  tags: string[];
  assetSlotDefinitions: JobSnapshotAssetSlot[];
  youtubeTarget: JobSnapshotYouTubeTarget | null;
}
