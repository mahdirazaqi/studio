import { businessRuleError } from "@/server/errors/app-error";
import { findConnectedYoutubeTargetInDepartment } from "@/features/youtube/repository/youtube-target-repository";

/**
 * A Template's `youtubeTargetId` must resolve to a `CONNECTED` Target in the
 * Template's own Department — never the actor's (the ADMIN-authoring-for-
 * another-department case), and never trusted from the client as-is. Mirrors
 * `verify-file-references.ts`'s exact reasoning for `defaultFileId`
 * (docs/domain/templates.md "Template ↔ Target").
 */
export async function verifyYoutubeTargetReference(
  departmentId: string,
  youtubeTargetId: string | null | undefined,
): Promise<string | null> {
  if (!youtubeTargetId) return null;

  const target = await findConnectedYoutubeTargetInDepartment(
    departmentId,
    youtubeTargetId,
  );
  if (!target) {
    throw businessRuleError(
      "The selected YouTube channel could not be found in this department, or is no longer connected.",
    );
  }
  return target.id;
}
