import { authorize, type Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import { findTemplateInScope } from "@/features/templates/repository/template-repository";

/**
 * Load one Template for the detail/edit view. `findTemplateInScope` already
 * returns `null` for both "doesn't exist" and "exists in another department"
 * (docs/architecture/authorization.md's 403-vs-404 guidance) — mirrors
 * `features/files/use-cases/get-file.ts`.
 */
export async function getTemplate(
  actor: Actor,
  templateId: string,
): Promise<SafeTemplateDetail> {
  authorize(actor, "template:view");
  const template = await findTemplateInScope(actor, templateId);
  if (!template) throw notFoundError();
  return template;
}
