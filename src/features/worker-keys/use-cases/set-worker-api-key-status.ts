import { authorize, type Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import type { SafeWorkerApiKey } from "@/features/worker-keys/domain/worker-api-key";
import {
  findWorkerApiKeyById,
  setWorkerApiKeyStatus,
} from "@/features/worker-keys/repository/worker-api-key-repository";

/**
 * Revoke/reactivate a Worker API Key — never a hard delete (a revoked key's
 * history — who created it, when it was last used — stays inspectable).
 * Idempotent: setting a key to the status it already has is a no-op.
 * Revocation takes effect on the Worker's **very next** request — nothing is
 * cached (`@/server/worker-auth` looks the row up fresh every time).
 */
async function setStatus(
  actor: Actor,
  keyId: string,
  status: "ACTIVE" | "REVOKED",
): Promise<SafeWorkerApiKey> {
  authorize(actor, "worker_key:manage");

  const existing = await findWorkerApiKeyById(keyId);
  if (!existing) throw notFoundError();

  if (existing.status !== status) {
    await setWorkerApiKeyStatus(keyId, status);
  }
  return { ...existing, status };
}

export function revokeWorkerApiKey(
  actor: Actor,
  keyId: string,
): Promise<SafeWorkerApiKey> {
  return setStatus(actor, keyId, "REVOKED");
}

export function reactivateWorkerApiKey(
  actor: Actor,
  keyId: string,
): Promise<SafeWorkerApiKey> {
  return setStatus(actor, keyId, "ACTIVE");
}
