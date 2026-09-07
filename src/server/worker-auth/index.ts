import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/server/db";
import { notFoundError, unauthenticatedError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";

/**
 * WORKER AUTHENTICATION BOUNDARY (ADR-0040, supersedes ADR-0032).
 *
 * The Render Worker is a machine principal, not a `User` — it never becomes an
 * `Actor` and is never authenticated via the dashboard's session cookie
 * (docs/architecture/authorization.md "Non-user principals"). This is the only
 * place a Worker's credential is read, hashed, or looked up — mirrors
 * `@/server/auth/session` being the sole boundary for human sessions, and
 * reuses the identical trust model: only a hash is ever stored (`WorkerApiKey.
keyHash`), so a database read alone never yields a usable credential
 * (ADR-0020).
 *
 * **Mechanism (ADR-0040):** each Worker identity is a `WorkerApiKey` row,
 * created by an ADMIN (`features/worker-keys`), sent as `Authorization: Bearer
 * <secret>`. A key is scoped to one or more Departments — the Worker may only
 * operate on Jobs belonging to those Departments (`assertWorkerDepartmentAccess`
 * below). This replaces Phase 7's single shared, non-departmental
 * `WORKER_API_KEY` env var — a real per-Worker identity with real scope now
 * exists, so that simplification is no longer needed or accurate.
 */

const BEARER_PREFIX = "Bearer ";

export function generateWorkerApiKeySecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The one hashing function for Worker API Key secrets — shared by
 * authentication (this module) and creation
 * (`features/worker-keys/use-cases/create-worker-api-key.ts`), the same way
 * `@/server/auth/password.ts` owns password hashing for both login and user
 * creation. */
export function hashWorkerApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export interface WorkerAuthContext {
  workerApiKeyId: string;
  /** The Department ids this Worker identity may operate on. Always at least
   * one — `features/worker-keys/use-cases/create-worker-api-key.ts` requires
   * it at creation. */
  allowedDepartmentIds: string[];
}

/**
 * Authenticate a Worker request and resolve its Department scope. Throws
 * `unauthenticated` (401) for a missing, malformed, revoked, or unknown
 * credential — never leaks which of those it was, and never echoes any part
 * of the submitted value back in the error. Intended as the `authenticate`
 * hook for every `/api/worker/v1/**` Route Handler (`defineRouteHandler`'s
 * `authenticate` config, `@/server/api`) — its return value flows into the
 * handler as `ctx.auth`.
 */
export async function authenticateWorker(
  request: Request,
): Promise<WorkerAuthContext> {
  const header = request.headers.get("authorization");
  const secret =
    header && header.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length).trim()
      : null;

  if (!secret) {
    throw unauthenticatedError(
      "A valid Worker credential is required (Authorization: Bearer <key>).",
    );
  }

  const key = await db.workerApiKey.findUnique({
    where: { keyHash: hashWorkerApiKeySecret(secret) },
    select: { id: true, status: true, departments: { select: { id: true } } },
  });

  if (!key || key.status !== "ACTIVE") {
    throw unauthenticatedError(
      "A valid Worker credential is required (Authorization: Bearer <key>).",
    );
  }

  // Best-effort telemetry — never blocks or fails the request, and never
  // logs any part of the credential itself (docs/security/security.md).
  db.workerApiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch((error: unknown) => {
      logger.warn("Failed to record Worker API Key last-used timestamp", {
        workerApiKeyId: key.id,
        cause: error,
      });
    });

  return {
    workerApiKeyId: key.id,
    allowedDepartmentIds: key.departments.map((department) => department.id),
  };
}

/**
 * The reusable Department-scope gate every Worker Job operation calls before
 * touching a specific Job (docs/integrations/worker-api.md "Worker API Keys").
 * Throws `not_found` (404), **never** `forbidden` (403) — a scoped-out Worker
 * must not be able to tell "exists in a Department I can't reach" apart from
 * "doesn't exist at all", the same 403-vs-404 discipline every dashboard
 * feature already follows for cross-department access
 * (docs/architecture/authorization.md).
 */
export function assertWorkerDepartmentAccess(
  allowedDepartmentIds: readonly string[],
  jobDepartmentId: string,
): void {
  if (!allowedDepartmentIds.includes(jobDepartmentId)) {
    throw notFoundError();
  }
}
