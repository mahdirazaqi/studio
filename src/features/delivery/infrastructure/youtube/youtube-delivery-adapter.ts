import "server-only";

import { logger } from "@/server/logger";
import {
  setVideoThumbnail,
  uploadVideo,
} from "@/server/adapters/youtube/youtube-client";
import { getValidAccessToken } from "@/features/youtube/use-cases/get-valid-access-token";

/**
 * `YouTubeDeliveryService` (docs/integrations/youtube.md "Delivery") — the
 * one place `features/delivery` calls into `features/youtube`. Resolves a
 * valid access token, uploads the video, then sets its thumbnail. Legacy ran
 * these as two separate, independently-erroring calls
 * (`YoutubeapiService.insertVideo` then `.setVideoThumbnail`) and treated a
 * thumbnail failure as non-fatal since the video was already live — kept
 * exactly: a thumbnail failure here is logged, never thrown, and never turns
 * a successful upload into a `DeliveryAttempt` failure.
 */
export interface DeliverToYoutubeInput {
  youtubeTargetId: string;
  title: string;
  description: string;
  tags: string[];
  videoBuffer: Buffer;
  thumbnailBuffer: Buffer;
}

export async function deliverToYoutube(
  input: DeliverToYoutubeInput,
): Promise<{ videoId: string }> {
  const accessToken = await getValidAccessToken(input.youtubeTargetId);

  const videoId = await uploadVideo({
    accessToken,
    title: input.title,
    description: input.description,
    tags: input.tags,
    videoBuffer: input.videoBuffer,
  });

  try {
    await setVideoThumbnail(accessToken, videoId, input.thumbnailBuffer);
  } catch (error) {
    logger.warn(
      "YouTube upload succeeded but setting its thumbnail failed (non-fatal)",
      { videoId, cause: error },
    );
  }

  return { videoId };
}
