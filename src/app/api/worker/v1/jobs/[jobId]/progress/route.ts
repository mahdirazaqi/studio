import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { commonSchemas } from "@/server/validation";
import { updateJobProgress } from "@/features/jobs/use-cases/update-job-progress";

/**
 * Worker progress report (legacy `PATCH /jobs/:id/progress`, `{ progress }`
 * unvalidated). `updateJobProgress` (Phase 6) enforces `0..100` and rejects a
 * terminal Job — this handler only authenticates, validates the request
 * shape, and delegates.
 */
export const PATCH = defineRouteHandler({
  name: "worker.jobs.progress",
  authenticate: authenticateWorker,
  params: z.object({ jobId: commonSchemas.id }),
  body: z.object({ progress: z.number().int().min(0).max(100) }),
  handler: async ({ params, body }) => {
    const job = await updateJobProgress({
      jobId: params.jobId,
      progress: body.progress,
    });
    return { id: job.id, progress: job.progress };
  },
});
