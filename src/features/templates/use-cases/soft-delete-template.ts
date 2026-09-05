import { authorize, type Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import {
  findTemplateInScope,
  softDeleteTemplate as softDeleteTemplateRepo,
} from "@/features/templates/repository/template-repository";

/**
 * Soft-delete a Template (ADR-0006) — the row is never physically removed.
 * Idempotent: deleting an already-deleted Template succeeds without error
 * (Phase 5 brief §25) rather than treating a repeat click as a conflict.
 */
export async function softDeleteTemplate(
  actor: Actor,
  templateId: string,
): Promise<void> {
  const template = await findTemplateInScope(actor, templateId);
  if (!template) throw notFoundError();

  authorize(actor, "template:manage", { departmentId: template.departmentId });

  if (template.deletedAt) return;

  await softDeleteTemplateRepo(templateId, actor.userId);
}
