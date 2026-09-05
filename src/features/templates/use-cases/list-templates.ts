import { authorize, type Actor } from "@/server/authz";
import type { SafeTemplate } from "@/features/templates/domain/template";
import { listTemplates as listTemplatesRepo } from "@/features/templates/repository/template-repository";
import type { ListTemplatesInput } from "@/features/templates/schemas/list-templates.schema";
import type { Paginated } from "@/types";

/**
 * The management list — always excludes soft-deleted Templates (Phase 5
 * brief §19). Role floor only; the actual department scoping happens inside
 * the repository via `departmentScopeFilter(actor)`, matching
 * `features/files/use-cases/list-files.ts`.
 */
export async function listDepartmentTemplates(
  actor: Actor,
  input: ListTemplatesInput,
): Promise<Paginated<SafeTemplate>> {
  authorize(actor, "template:view");
  return listTemplatesRepo(actor, input);
}
