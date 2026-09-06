import { authorize, type Actor } from "@/server/authz";
import { dependencyError } from "@/server/errors/app-error";
import { encryptToken } from "@/server/adapters/youtube/token-cipher";
import {
  fetchOwnChannel,
  refreshAccessToken,
} from "@/server/adapters/youtube/youtube-client";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import { upsertYoutubeTarget } from "@/features/youtube/repository/youtube-target-repository";
import { resolveTargetDepartment } from "@/features/youtube/use-cases/resolve-target-department";
import type { ConnectYoutubeTargetInput } from "@/features/youtube/schemas/connect-youtube-target.schema";

/**
 * Register a YouTube channel connection (docs/integrations/youtube.md
 * "YouTube Target", ADR-0039). **Deliberately not a self-service OAuth
 * consent-screen flow** — the operator obtains a refresh token out-of-band
 * (e.g. Google's OAuth Playground against Studio's own registered app) and
 * pastes it here; Studio verifies it immediately by actually calling the
 * YouTube API (`fetchOwnChannel`) rather than trusting a client-supplied
 * channel id, then stores it encrypted (ADR-0039's documented scope
 * reduction — see the model's own doc comment for why).
 *
 * `youtube:manage` is MANAGER+, department-scoped — mirrors `template:manage`.
 */
export async function connectYoutubeTarget(
  actor: Actor,
  input: ConnectYoutubeTargetInput,
): Promise<SafeYouTubeTarget> {
  const departmentId = await resolveTargetDepartment(actor, input.departmentId);
  authorize(actor, "youtube:manage", { departmentId });

  let accessToken: string;
  try {
    ({ accessToken } = await refreshAccessToken(input.refreshToken));
  } catch {
    throw dependencyError(
      "This refresh token could not be used to obtain a YouTube access token. Double-check it was copied correctly and has not been revoked.",
    );
  }

  const channel = await fetchOwnChannel(accessToken);

  return upsertYoutubeTarget({
    departmentId,
    name: input.name,
    youtubeChannelId: channel.channelId,
    encryptedRefreshToken: encryptToken(input.refreshToken),
    createdByUserId: actor.userId,
  });
}
