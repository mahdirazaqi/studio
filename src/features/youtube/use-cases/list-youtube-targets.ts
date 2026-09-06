import { authorize, type Actor } from "@/server/authz";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import { listYoutubeTargets as listYoutubeTargetsRepo } from "@/features/youtube/repository/youtube-target-repository";

export async function listYoutubeTargets(
  actor: Actor,
): Promise<SafeYouTubeTarget[]> {
  authorize(actor, "youtube:manage");
  return listYoutubeTargetsRepo(actor);
}
