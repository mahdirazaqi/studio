import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/server/env";
import { unauthenticatedError } from "@/server/errors/app-error";

/**
 * WORKER AUTHENTICATION BOUNDARY.
 *
 * The Render Worker is a machine principal, not a `User` — it never becomes an
 * `Actor` and is never authenticated via the dashboard's session cookie
 * (docs/architecture/authorization.md "Non-user principals";
 * docs/domain/jobs.md "Worker identity vs User identity"). This is the only
 * place a Worker's credential is read or compared — mirrors `@/server/auth`
 * being the sole boundary for human sessions.
 *
 * Mechanism (ADR-0032, resolves OD-27): a single shared static API key,
 * configured as `WORKER_API_KEY`, sent as `Authorization: Bearer <key>` on
 * every `/api/worker/v1/**` request. There is no `WorkerCredential` database
 * table, no per-Worker identity, and no revoke-without-redeploy path — see the
 * ADR for why that is a deliberate, documented simplification for this phase
 * rather than an oversight.
 */

const BEARER_PREFIX = "Bearer ";

/**
 * Constant-time string comparison for a variable-length, user-supplied token
 * against the configured secret. `crypto.timingSafeEqual` itself requires
 * equal-length buffers and throws otherwise — comparing a fixed-length SHA-256
 * digest of each string instead avoids both the length-mismatch exception and
 * the timing leak a naive `a.length !== b.length` early-return would create
 * (an attacker could otherwise learn the secret's length one guess at a time).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Authenticate a Worker request. Throws `unauthenticated` (401) for a missing,
 * malformed, or incorrect credential — never leaks which of those it was, and
 * never echoes any part of the submitted value back in the error. Intended as
 * the `authenticate` hook for every `/api/worker/v1/**` Route Handler
 * (`defineRouteHandler`'s `authenticate` config, `@/server/api`).
 */
export function authenticateWorker(request: Request): void {
  const header = request.headers.get("authorization");
  const token =
    header && header.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length).trim()
      : null;

  if (!token || !timingSafeStringEqual(token, env.WORKER_API_KEY)) {
    throw unauthenticatedError(
      "A valid Worker credential is required (Authorization: Bearer <key>).",
    );
  }
}
