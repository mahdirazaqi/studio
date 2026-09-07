import { authorize, type Actor } from "@/server/authz";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import { listYoutubeTargets as listYoutubeTargetsRepo } from "@/features/youtube/repository/youtube-target-repository";

/** ADMIN-only (`youtube:manage`, revised ADR-0040) — every Target,
 * regardless of Department assignment. */
export async function listYoutubeTargets(
  actor: Actor,
): Promise<SafeYouTubeTarget[]> {
  authorize(actor, "youtube:manage");
  return listYoutubeTargetsRepo();
}
