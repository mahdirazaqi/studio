import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import type { SafeYouTubeTarget } from "@/features/youtube/domain/youtube-target";
import {
  findYoutubeTargetById,
  setYoutubeTargetDepartments,
} from "@/features/youtube/repository/youtube-target-repository";
import { departmentsExist } from "@/features/departments/repository/department-repository";

/**
 * ADMIN edits which Departments a YouTube Target is assigned to
 * (docs/integrations/youtube.md "Editing scope") — a full replace of the
 * assignment set, taking effect immediately (no cache to invalidate: the
 * next Template-form load or Job creation reads the relation fresh).
 * Removing a Department a Template currently references does **not** touch
 * that Template — `verify-youtube-target.ts` only re-checks membership the
 * next time that Template is *saved*, matching how Templates already handle
 * a since-deleted default File (never retroactively edited, only checked on
 * the next write).
 */
export async function updateYoutubeTargetDepartments(
  actor: Actor,
  targetId: string,
  departmentIds: string[],
): Promise<SafeYouTubeTarget> {
  authorize(actor, "youtube:manage");

  const existing = await findYoutubeTargetById(targetId);
  if (!existing) throw notFoundError();

  if (!(await departmentsExist(departmentIds))) {
    throw businessRuleError("One or more selected departments do not exist.");
  }

  return setYoutubeTargetDepartments(targetId, departmentIds);
}
