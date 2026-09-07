import { businessRuleError } from "@/server/errors/app-error";
import { findConnectedYoutubeTargetForDepartment } from "@/features/youtube/repository/youtube-target-repository";

/**
 * A Template's `youtubeTargetId` must resolve to a `CONNECTED` Target
 * **assigned to** the Template's own Department (ADR-0040 — a Target may now
 * be assigned to several Departments, not owned by exactly one) — never the
 * actor's (the ADMIN-authoring-for-another-department case), and never
 * trusted from the client as-is. Mirrors `verify-file-references.ts`'s exact
 * reasoning for `defaultFileId` (docs/domain/templates.md "Template ↔ Target").
 */
export async function verifyYoutubeTargetReference(
  departmentId: string,
  youtubeTargetId: string | null | undefined,
): Promise<string | null> {
  if (!youtubeTargetId) return null;

  const target = await findConnectedYoutubeTargetForDepartment(
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
