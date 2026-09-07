import { authorize, type Actor } from "@/server/authz";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import { listYoutubeTargets } from "@/features/youtube/repository/youtube-target-repository";

/**
 * ADMIN-only, every-Department `CONNECTED` YouTube Target listing — mirrors
 * `features/files/use-cases/list-all-gallery-files-for-admin.ts` exactly, for
 * the same reason: ADMIN authoring a Template needs *some* Target list before
 * a department is even chosen in the form; `SafeYouTubeTarget.departmentIds`
 * (plural, ADR-0040) lets the client filter down to whichever department is
 * currently selected.
 */
export async function listAllYoutubeTargetsForTemplateFormAdmin(
  actor: Actor,
): Promise<SafeYouTubeTarget[]> {
  authorize(actor, "department:view_all");
  const targets = await listYoutubeTargets();
  return targets.filter((target) => target.status === "CONNECTED");
}
