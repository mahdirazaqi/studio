import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { commonSchemas } from "@/server/validation";
import { updateJobDuration } from "@/features/jobs/use-cases/update-job-duration";

/**
 * Worker duration report (legacy `PATCH /jobs/:id/duration`, `{ duration }`
 * unvalidated). `updateJobDuration` (Phase 6) enforces `>= 0` and rejects a
 * terminal Job.
 */
export const PATCH = defineRouteHandler({
  name: "worker.jobs.duration",
  authenticate: authenticateWorker,
  params: z.object({ jobId: commonSchemas.id }),
  body: z.object({ durationSeconds: z.number().int().min(0) }),
  handler: async ({ params, body, auth }) => {
    const job = await updateJobDuration(
      { jobId: params.jobId, durationSeconds: body.durationSeconds },
      auth.allowedDepartmentIds,
    );
    return { id: job.id, durationSeconds: job.durationSeconds };
  },
});
