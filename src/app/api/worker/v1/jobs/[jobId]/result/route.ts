import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { commonSchemas } from "@/server/validation";
import { acceptJobResult } from "@/features/delivery/use-cases/accept-job-result";

/**
 * `POST /api/worker/v1/jobs/:id/result` — the endpoint
 * docs/integrations/worker-api.md §6 explicitly deferred to a future phase
 * (legacy `POST /jobs/:id/upload`). Implemented, Phase 9.
 *
 * **Not JSON** — the request body is the raw rendered video bytes (any
 * `Content-Type`; the actual type is sniffed from the bytes themselves,
 * never trusted from the header, docs/security/security.md). This is why
 * `defineRouteHandler`'s `body` schema is omitted rather than extended with a
 * multipart parser: a raw-bytes `POST` mirrors `/api/files/[fileId]`'s own
 * raw-bytes `GET` response and needs no new framework capability.
 *
 * Thin wrapper only, per the Worker-layer convention (CLAUDE.md §13): reads
 * the body, calls `acceptJobResult` (Phase 9's use case), maps the result. No
 * media-processing, state-machine, or delivery logic lives here.
 */
export const POST = defineRouteHandler({
  name: "worker.jobs.result",
  authenticate: authenticateWorker,
  params: z.object({ jobId: commonSchemas.id }),
  handler: async ({ params, request }) => {
    const videoBuffer = Buffer.from(await request.arrayBuffer());
    const job = await acceptJobResult(params.jobId, videoBuffer);
    return {
      id: job.id,
      state: job.state,
      videoFileId: job.videoFileId,
    };
  },
});
