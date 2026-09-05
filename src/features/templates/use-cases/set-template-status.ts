import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import type { TemplateStatus } from "@/features/templates/domain/template";
import {
  findTemplateInScope,
  setTemplateStatus as setTemplateStatusRepo,
} from "@/features/templates/repository/template-repository";

/**
 * Enable/disable a Template — a state independent of soft deletion
 * (docs/domain/templates.md "Enabled / Disabled state"; Phase 5 brief §7/§25).
 * A soft-deleted Template can never be (re-)enabled or disabled: it is no
 * longer an active resource, only a retained historical record.
 */
async function setTemplateStatus(
  actor: Actor,
  templateId: string,
  status: TemplateStatus,
): Promise<void> {
  const template = await findTemplateInScope(actor, templateId);
  if (!template) throw notFoundError();

  authorize(actor, "template:manage", { departmentId: template.departmentId });

  if (template.deletedAt) {
    throw businessRuleError(
      "This template has been deleted and can no longer be enabled or disabled.",
    );
  }

  // Idempotent — setting the status a template already has is a no-op, not
  // an error (Phase 5 brief §25's "handled idempotently" applies equally
  // here as it does to soft delete).
  if (template.status === status) return;

  await setTemplateStatusRepo(templateId, status);
}

export function enableTemplate(
  actor: Actor,
  templateId: string,
): Promise<void> {
  return setTemplateStatus(actor, templateId, "ACTIVE");
}

export function disableTemplate(
  actor: Actor,
  templateId: string,
): Promise<void> {
  return setTemplateStatus(actor, templateId, "DISABLED");
}
