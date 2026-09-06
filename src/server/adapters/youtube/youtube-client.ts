import "server-only";

import { Readable } from "node:stream";

import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

import { env } from "@/server/env";
import { AppError, dependencyError } from "@/server/errors/app-error";

/**
 * The only module that imports `googleapis` (docs/architecture/decisions.md
 * ADR-0039, mirrors `@/server/adapters/telegram/client.ts` owning `telegraf`
 * and `@/server/adapters/storage` owning `node:fs`). Pure wrapper over the
 * YouTube Data API v3 — no Studio domain knowledge (no `Job`/`Template`
 * types), no token persistence (that's `features/youtube/repository`).
 */

function requireOAuthClientConfig(): {
  clientId: string;
  clientSecret: string;
} {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw dependencyError(
      "YouTube delivery is not configured on this deployment (missing OAuth client credentials).",
    );
  }
  return {
    clientId: env.YOUTUBE_CLIENT_ID,
    clientSecret: env.YOUTUBE_CLIENT_SECRET,
  };
}

function buildOAuthClient(refreshToken: string): OAuth2Client {
  const { clientId, clientSecret } = requireOAuthClientConfig();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export interface RefreshedAccessToken {
  accessToken: string;
  expiresAt: Date;
}

/** Exchanges the stored refresh token for a fresh access token. Never caches
 * anything itself — the caller (`features/youtube/infrastructure/
 * youtube-client.ts`) decides whether to persist the result. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshedAccessToken> {
  const client = buildOAuthClient(refreshToken);
  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) {
      throw dependencyError("YouTube did not return an access token.");
    }
    return {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + 55 * 60_000),
    };
  } catch (error) {
    throw dependencyError(
      "Could not refresh the YouTube access token. The connection may need to be re-established.",
      { cause: error },
    );
  }
}

export interface YoutubeChannelIdentity {
  channelId: string;
  title: string;
}

/** Used only when connecting a Target — confirms the refresh token is valid
 * and resolves the channel it belongs to, so Studio never has to trust a
 * client-supplied channel id. */
export async function fetchOwnChannel(
  accessToken: string,
): Promise<YoutubeChannelIdentity> {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  try {
    const service = google.youtube("v3");
    const resp = await service.channels.list({
      auth: client,
      part: ["snippet"],
      mine: true,
    });
    const channel = resp.data.items?.[0];
    if (!channel?.id || !channel.snippet?.title) {
      throw dependencyError(
        "Could not resolve a YouTube channel for this credential.",
      );
    }
    return { channelId: channel.id, title: channel.snippet.title };
  } catch (error) {
    if (AppError.isAppError(error)) throw error;
    throw dependencyError("Could not reach the YouTube API.", { cause: error });
  }
}

export interface UploadVideoInput {
  accessToken: string;
  title: string;
  description: string;
  tags: string[];
  videoBuffer: Buffer;
}

/**
 * Uploads a video (legacy: `YoutubeapiService.insertVideo`). Privacy and
 * audience are **hard-coded** `private`/`madeForKids: false` — matches legacy
 * exactly and is a deliberate safety default, never configurable per Job/
 * Template this phase (docs/integrations/youtube.md "Video privacy", OD-37
 * stays open).
 */
export async function uploadVideo(input: UploadVideoInput): Promise<string> {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: input.accessToken });
  try {
    const service = google.youtube("v3");
    const resp = await service.videos.insert({
      auth: client,
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
        },
        status: {
          privacyStatus: "private",
          madeForKids: false,
        },
      },
      media: { body: Readable.from(input.videoBuffer) },
    });
    const videoId = resp.data.id;
    if (!videoId) throw dependencyError("YouTube did not return a video id.");
    return videoId;
  } catch (error) {
    throw dependencyError("The YouTube upload failed.", { cause: error });
  }
}

/** Sets the video's thumbnail (legacy: `YoutubeapiService.setVideoThumbnail`). */
export async function setVideoThumbnail(
  accessToken: string,
  videoId: string,
  imageBuffer: Buffer,
): Promise<void> {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  try {
    const service = google.youtube("v3");
    await service.thumbnails.set({
      auth: client,
      videoId,
      media: { body: Readable.from(imageBuffer) },
    });
  } catch (error) {
    // Legacy did not treat a thumbnail failure as fatal to the upload either
    // (it ran as a second, separate call after `insertVideo` already
    // succeeded) — the video is already live; Studio logs and surfaces this
    // as a soft failure rather than marking the whole delivery `ERROR` for a
    // cosmetic step. See `features/delivery/use-cases/deliver-job-result.ts`.
    throw dependencyError("Setting the YouTube thumbnail failed.", {
      cause: error,
    });
  }
}
