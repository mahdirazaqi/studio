import { dependencyError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import {
  decryptToken,
  encryptToken,
} from "@/server/adapters/youtube/token-cipher";
import { refreshAccessToken } from "@/server/adapters/youtube/youtube-client";
import {
  findTokensById,
  markYoutubeTargetError,
  updateAccessTokenCache,
} from "@/features/youtube/repository/youtube-target-repository";

/** Refresh a bit before the token's real expiry so a slow request never gets
 * caught using a token Google is about to reject. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Returns a currently-valid access token for `targetId`, refreshing and
 * re-caching it (encrypted) first if the cached one is missing or about to
 * expire. Never returns/logs the refresh token itself. On a refresh failure
 * (revoked/expired refresh token), marks the Target `ERROR` with a safe
 * reason so it stops being offered as a delivery option until reconnected —
 * see `docs/integrations/youtube.md` "Delivery failure handling".
 */
export async function getValidAccessToken(targetId: string): Promise<string> {
  const tokens = await findTokensById(targetId);
  if (!tokens) {
    throw dependencyError("This YouTube connection no longer exists.");
  }

  const cachedStillValid =
    tokens.encryptedAccessToken &&
    tokens.accessTokenExpiresAt &&
    tokens.accessTokenExpiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS >
      Date.now();

  if (cachedStillValid) {
    return decryptToken(tokens.encryptedAccessToken!);
  }

  try {
    const refreshToken = decryptToken(tokens.encryptedRefreshToken);
    const refreshed = await refreshAccessToken(refreshToken);
    await updateAccessTokenCache(
      targetId,
      encryptToken(refreshed.accessToken),
      refreshed.expiresAt,
    );
    return refreshed.accessToken;
  } catch (error) {
    const reason =
      "Could not refresh the YouTube access token — the connection may have been revoked and needs to be re-established.";
    logger.error("YouTube access token refresh failed", {
      targetId,
      cause: error,
    });
    await markYoutubeTargetError(targetId, reason).catch(() => undefined);
    throw dependencyError(reason);
  }
}
