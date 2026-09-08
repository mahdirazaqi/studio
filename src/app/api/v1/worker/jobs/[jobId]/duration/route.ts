import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { commonSchemas } from "@/server/validation";
import { updateJobDuration } from "@/features/jobs/use-cases/update-job-duration";

/**
 * Worker duration report (legacy `PATCH /jobs/:id/duration`, `{ duration }`
 * unvalidated).
 *
 * **Body field name — revised, ADR-0043.** The actual Worker
 * (`navaak-ae-renderer/renderer/operator/request.go`'s `SetDuration`) sends
 * `{ "duration": <int seconds> }` — the field is named `duration`, not
 * `durationSeconds`. Studio's own internal domain field is (and stays)
 * `Job.durationSeconds` — this route is the one place the Worker's actual
 * wire field name is accepted and mapped onto it; `updateJobDuration` (Phase
 * 6) still enforces `>= 0` and rejects a terminal Job.
 */
export const PATCH = defineRouteHandler({
  name: "worker.jobs.duration",
  authenticate: authenticateWorker,
  params: z.object({ jobId: commonSchemas.id }),
  body: z.object({ duration: z.number().int().min(0) }),
  handler: async ({ params, body, auth }) => {
    const job = await updateJobDuration(
      { jobId: params.jobId, durationSeconds: body.duration },
      auth.allowedDepartmentIds,
    );
    return { id: job.id, duration: job.durationSeconds };
  },
});
