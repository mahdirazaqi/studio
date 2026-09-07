import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, dependencyError } from "@/server/errors/app-error";
import { encryptToken } from "@/server/adapters/youtube/token-cipher";
import {
  fetchOwnChannel,
  refreshAccessToken,
} from "@/server/adapters/youtube/youtube-client";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import { upsertYoutubeTarget } from "@/features/youtube/repository/youtube-target-repository";
import { departmentsExist } from "@/features/departments/repository/department-repository";
import type { ConnectYoutubeTargetInput } from "@/features/youtube/schemas/connect-youtube-target.schema";

/**
 * Register a YouTube channel connection (docs/integrations/youtube.md
 * "YouTube Target", ADR-0039/ADR-0040). **Deliberately not a self-service
 * OAuth consent-screen flow** — the operator obtains a refresh token
 * out-of-band (e.g. Google's OAuth Playground against Studio's own
 * registered app) and pastes it here; Studio verifies it immediately by
 * actually calling the YouTube API (`fetchOwnChannel`) rather than trusting
 * a client-supplied channel id, then stores it encrypted.
 *
 * **Revised, ADR-0040: `youtube:manage` is ADMIN-only** (was MANAGER+,
 * department-scoped) — connecting a channel and choosing which Departments
 * may use it is system-wide infrastructure configuration, the same
 * reasoning Worker API Keys use. `departmentIds` is never resolved from the
 * actor's own department (there is no "own department" concept for an
 * ADMIN-only operation) — every id is validated to actually exist.
 */
export async function connectYoutubeTarget(
  actor: Actor,
  input: ConnectYoutubeTargetInput,
): Promise<SafeYouTubeTarget> {
  authorize(actor, "youtube:manage");

  if (!(await departmentsExist(input.departmentIds))) {
    throw businessRuleError("One or more selected departments do not exist.");
  }

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
    departmentIds: input.departmentIds,
    name: input.name,
    youtubeChannelId: channel.channelId,
    encryptedRefreshToken: encryptToken(input.refreshToken),
    createdByUserId: actor.userId,
  });
}
