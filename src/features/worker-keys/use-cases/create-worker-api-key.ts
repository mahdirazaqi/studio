import { authorize, type Actor } from "@/server/authz";
import { businessRuleError } from "@/server/errors/app-error";
import {
  generateWorkerApiKeySecret,
  hashWorkerApiKeySecret,
} from "@/server/worker-auth";
import type { CreatedWorkerApiKey } from "@/features/worker-keys/domain/worker-api-key";
import { createWorkerApiKey as createWorkerApiKeyRepo } from "@/features/worker-keys/repository/worker-api-key-repository";
import { departmentsExist } from "@/features/departments/repository/department-repository";
import type { CreateWorkerApiKeyInput } from "@/features/worker-keys/schemas/worker-api-key-input.schema";

/**
 * Create a Worker API Key (docs/integrations/worker-api.md "Worker API
 * Keys", ADR-0040). **ADMIN-only** (`worker_key:manage`). The raw secret is
 * generated here, hashed for storage, and returned **once** — the caller
 * (the Server Action → the create form) is responsible for showing it to the
 * Admin exactly once; nothing in this codebase stores or re-serves it.
 */
export async function createWorkerApiKey(
  actor: Actor,
  input: CreateWorkerApiKeyInput,
): Promise<CreatedWorkerApiKey> {
  authorize(actor, "worker_key:manage");

  if (!(await departmentsExist(input.departmentIds))) {
    throw businessRuleError("One or more selected departments do not exist.");
  }

  const secret = generateWorkerApiKeySecret();
  const key = await createWorkerApiKeyRepo({
    name: input.name,
    keyHash: hashWorkerApiKeySecret(secret),
    departmentIds: input.departmentIds,
    createdByUserId: actor.userId,
  });

  return { key, secret };
}
