import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { commonSchemas } from "@/server/validation";
import { workerTransitionSchema } from "@/features/jobs/schemas/worker-transition.schema";
import { transitionJobForWorker } from "@/features/jobs/use-cases/transition-job-for-worker";

/**
 * Worker-driven state transition (legacy `PATCH /jobs/:id/state`, which
 * accepted **any** integer with no validation — the exact defect ADR-0013/
 * ADR-0029's state machine exists to close). `transitionJobForWorker` only
 * *maps* the Worker's legacy-int-or-name input; `transitionJob` (Phase 6)
 * still decides — and atomically enforces — whether the transition is legal.
 * An authenticated Worker sending an invalid transition gets `422`
 * (`business_rule`, via `isValidTransition`'s pre-check) or `409`
 * (`conflict`, if it lost a race), never a silent state overwrite.
 */
export const PATCH = defineRouteHandler({
  name: "worker.jobs.state",
  authenticate: authenticateWorker,
  params: z.object({ jobId: commonSchemas.id }),
  body: workerTransitionSchema,
  handler: async ({ params, body }) => {
    const job = await transitionJobForWorker(params.jobId, body);
    return { id: job.id, state: job.state };
  },
});
