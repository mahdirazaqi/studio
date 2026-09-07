import { authorize, type Actor } from "@/server/authz";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import { listConnectedYoutubeTargetsForDepartment } from "@/features/youtube/repository/youtube-target-repository";

/**
 * The `CONNECTED` YouTube Targets **assigned to** `departmentId` that a
 * Template author may pick from (docs/domain/templates.md "Template ↔
 * Target", ADR-0040). Gated by `template:manage` (the capability that
 * actually matters here — authoring a Template), **not** `youtube:manage` —
 * picking an existing, already-connected, already-scoped Target for a
 * Template is not the same operation as connecting/managing Targets
 * themselves (that's ADMIN-only). Reads the Youtube feature's repository
 * directly rather than one of its use-cases
 * (docs/architecture/project-structure.md §3 — the same pattern
 * `resolve-job-assets.ts` uses for Files).
 */
export async function listYoutubeTargetsForTemplateForm(
  actor: Actor,
  departmentId: string,
): Promise<SafeYouTubeTarget[]> {
  authorize(actor, "template:manage", { departmentId });
  return listConnectedYoutubeTargetsForDepartment(departmentId);
}
