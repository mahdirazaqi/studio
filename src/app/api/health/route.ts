import { healthResponse } from "@/server/api";
import { env } from "@/server/env";

/**
 * Liveness/readiness probe. No authentication, no domain data.
 * The only Route Handler that exists in Phase 1 — it validates the REST
 * plumbing (see docs/architecture/rest-architecture.md) without exposing
 * anything.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return healthResponse({
    status: "ok",
    service: "studio",
    environment: env.NODE_ENV,
    time: new Date().toISOString(),
  });
}
