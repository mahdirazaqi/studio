import { authorize, type Actor } from "@/server/authz";
import type { SafeWorkerApiKey } from "@/features/worker-keys/domain/worker-api-key";
import { listWorkerApiKeys as listWorkerApiKeysRepo } from "@/features/worker-keys/repository/worker-api-key-repository";

export async function listWorkerApiKeys(
  actor: Actor,
): Promise<SafeWorkerApiKey[]> {
  authorize(actor, "worker_key:manage");
  return listWorkerApiKeysRepo();
}
