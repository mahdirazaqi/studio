import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { claimNextJob } from "@/features/jobs/use-cases/claim-next-job";
import { buildWorkerJobPayload } from "@/features/jobs/domain/worker-job-payload";
import { buildFileUrlFromRequest } from "@/app/api/v1/worker/_lib/build-file-url";

/**
 * Atomic Job claim (docs/integrations/worker-api.md; ADR-0029 for the
 * underlying atomicity, ADR-0032 for Worker auth). Maps to legacy
 * `GET /jobs/fetch`, deliberately `POST` here — claiming mutates state, and a
 * side-effecting `GET` is exactly what legacy got wrong (Security
 * Requirements §11: "no state-changing GET requests").
 *
 * Empty-queue semantics (resolves the Phase 7 brief §11 OPEN DECISION): no
 * eligible Job returns `204 No Content`, not an error and not an ambiguous
 * `200` with an empty body — a Worker's poll finding nothing to do is a
 * normal outcome, not a failure. `claimNextJob()` returning `null` triggers
 * `defineRouteHandler`'s built-in `null` → `204` mapping.
 *
 * Never touches Prisma directly — `claimNextJob()` (Phase 6) already
 * provides the atomic `SELECT ... FOR UPDATE SKIP LOCKED` guarantee; this
 * handler only authenticates, calls it, and maps the result to the
 * Worker-facing payload shape.
 */
export const POST = defineRouteHandler({
  name: "worker.jobs.next",
  authenticate: authenticateWorker,
  handler: async ({ request, auth }) => {
    const job = await claimNextJob(auth.allowedDepartmentIds);
    if (!job) return null;
    return buildWorkerJobPayload(job, (fileId) =>
      buildFileUrlFromRequest(request, fileId),
    );
  },
});
