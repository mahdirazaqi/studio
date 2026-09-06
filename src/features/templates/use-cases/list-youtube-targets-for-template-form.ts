import { authorize, type Actor } from "@/server/authz";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import { listConnectedYoutubeTargetsInDepartment } from "@/features/youtube/repository/youtube-target-repository";

/**
 * The `CONNECTED` YouTube Targets a Template author may pick from
 * (docs/domain/templates.md "Template ↔ Target"). Gated by `template:manage`
 * (the capability that actually matters here — authoring a Template),
 * **not** `youtube:manage` — picking an existing, already-connected Target
 * for a Template is not the same operation as connecting/managing Targets
 * themselves. Reads the Youtube feature's repository directly rather than
 * one of its use-cases (docs/architecture/project-structure.md §3 — the same
 * pattern `resolve-job-assets.ts` uses for Files).
 */
export async function listYoutubeTargetsForTemplateForm(
  actor: Actor,
  departmentId: string,
): Promise<SafeYouTubeTarget[]> {
  authorize(actor, "template:manage", { departmentId });
  return listConnectedYoutubeTargetsInDepartment(departmentId);
}
