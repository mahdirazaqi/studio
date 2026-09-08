import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { commonSchemas } from "@/server/validation";
import { getJobForWorker } from "@/features/jobs/use-cases/get-job-for-worker";
import { buildWorkerJobPayload } from "@/features/jobs/domain/worker-job-payload";
import { buildFileUrlFromRequest } from "@/app/api/v1/worker/_lib/build-file-url";

/**
 * Read one Job (legacy `GET /jobs/:id`) — for Worker restart/recovery: a
 * Worker that crashed mid-render can re-fetch the Job it was working on by
 * id instead of losing its place. Same payload shape as the claim endpoint.
 *
 * Trust model (Phase 7 brief §13/§14, resolves OD-30): Studio's Worker is one
 * shared, non-departmental principal with no per-Worker identity — there is
 * no "did *this* Worker claim this Job" check to perform, and pretending one
 * exists would be dishonest. Any authenticated Worker request may read any
 * Job by id, claimed or not. If per-Worker leasing is ever needed, that is a
 * new `WorkerCredential`/identity design, not a change to this endpoint's
 * shape.
 */
export const GET = defineRouteHandler({
  name: "worker.jobs.get",
  authenticate: authenticateWorker,
  params: z.object({ jobId: commonSchemas.id }),
  handler: async ({ params, request, auth }) => {
    const job = await getJobForWorker(params.jobId, auth.allowedDepartmentIds);
    return buildWorkerJobPayload(job, (fileId, filenameHint) =>
      buildFileUrlFromRequest(request, fileId, filenameHint),
    );
  },
});
