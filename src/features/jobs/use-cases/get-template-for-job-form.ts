import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import { findTemplateInScope } from "@/features/templates/repository/template-repository";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";

/**
 * The Job creation form's "load this template's asset slots" step — called
 * when an operator picks a Template, before they've filled in any asset
 * values yet. Mirrors exactly what `createJob` will itself re-check at
 * submission time (same repository call, same status/deletion checks); this
 * is purely so the form can render the right inputs early, never a substitute
 * for `createJob`'s own validation.
 */
export async function getTemplateForJobForm(
  actor: Actor,
  templateId: string,
): Promise<SafeTemplateDetail> {
  authorize(actor, "job:manage");

  const template = await findTemplateInScope(actor, templateId);
  if (!template) throw notFoundError();

  if (template.deletedAt || template.status !== "ACTIVE") {
    throw businessRuleError("This template is not available for new jobs.");
  }

  return template;
}
