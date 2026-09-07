/**
 * Pure domain types for the Worker API Key feature (docs/integrations/
 * worker-api.md "Worker API Keys", ADR-0040). No I/O, no Prisma import —
 * mirrors `features/youtube/domain/youtube-target.ts`.
 */

export const WORKER_API_KEY_STATUSES = ["ACTIVE", "REVOKED"] as const;
export type WorkerApiKeyStatus = (typeof WORKER_API_KEY_STATUSES)[number];

/** Never carries `keyHash` — safe to hand to a Server Component or return
 * from a Server Action. The raw secret itself exists only transiently, in
 * `CreatedWorkerApiKey` below, at the moment of creation. */
export interface SafeWorkerApiKey {
  id: string;
  name: string;
  status: WorkerApiKeyStatus;
  departmentIds: string[];
  createdByUserId: string;
  createdByName: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Returned **only** by `createWorkerApiKey` — the one moment the raw
 * secret exists outside the Worker's own memory. Never returned by any
 * list/detail read afterward (docs/security/security.md). */
export interface CreatedWorkerApiKey {
  key: SafeWorkerApiKey;
  secret: string;
}
