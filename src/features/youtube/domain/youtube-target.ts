/**
 * Pure domain types for the YouTube Target feature (docs/integrations/youtube.md,
 * ADR-0039). No I/O, no Prisma import — mirrors `features/templates/domain/template.ts`.
 */

export const YOUTUBE_TARGET_STATUSES = [
  "CONNECTED",
  "DISCONNECTED",
  "ERROR",
] as const;
export type YouTubeTargetStatus = (typeof YOUTUBE_TARGET_STATUSES)[number];

/** Never carries a token, encrypted or not — safe to hand to a Server
 * Component or return from a Server Action. */
export interface SafeYouTubeTarget {
  id: string;
  departmentId: string;
  name: string;
  youtubeChannelId: string;
  status: YouTubeTargetStatus;
  lastErrorReason: string | null;
  createdByUserId: string;
  createdByName: string | null;
  createdAt: Date;
}
