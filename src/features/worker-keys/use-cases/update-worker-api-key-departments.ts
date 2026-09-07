import { authorize, type Actor } from "@/server/authz";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import type { SafeWorkerApiKey } from "@/features/worker-keys/domain/worker-api-key";
import {
  findWorkerApiKeyById,
  setWorkerApiKeyDepartments,
} from "@/features/worker-keys/repository/worker-api-key-repository";
import { departmentsExist } from "@/features/departments/repository/department-repository";

/**
 * ADMIN edits a Worker API Key's Department scope
 * (docs/integrations/worker-api.md "Worker API Keys"). A full replace of
 * the assignment set. Never cached — the very next Worker request under
 * this key resolves the new scope (`@/server/worker-auth`).
 */
export async function updateWorkerApiKeyDepartments(
  actor: Actor,
  keyId: string,
  departmentIds: string[],
): Promise<SafeWorkerApiKey> {
  authorize(actor, "worker_key:manage");

  const existing = await findWorkerApiKeyById(keyId);
  if (!existing) throw notFoundError();

  if (!(await departmentsExist(departmentIds))) {
    throw businessRuleError("One or more selected departments do not exist.");
  }

  return setWorkerApiKeyDepartments(keyId, departmentIds);
}
