import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { validationError } from "@/server/errors/app-error";
import { commonSchemas } from "@/server/validation";
import { FILE_KIND_RULES } from "@/features/files/domain/file-types";
import { acceptJobResult } from "@/features/delivery/use-cases/accept-job-result";

const VIDEO_MAX_SIZE_BYTES =
  FILE_KIND_RULES.find((rule) => rule.kind === "VIDEO")?.maxSizeBytes ?? 0;

/**
 * `POST /api/v1/worker/jobs/:id/result` — the endpoint
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
 *
 * **Phase 10 hardening:** `Content-Length` is checked against the video size
 * limit *before* the body is read into memory — `acceptJobResult`'s own size
 * check happens only after `request.arrayBuffer()` has already buffered the
 * whole body, which is too late to bound memory use against an oversized
 * payload from a credential holder (docs/security/security.md §5 "oversized
 * payloads"). A request with no `Content-Length` (chunked transfer) still
 * falls through to the post-buffering check — this is a defense-in-depth
 * fast path, not a replacement for it.
 */
export const POST = defineRouteHandler({
  name: "worker.jobs.result",
  authenticate: authenticateWorker,
  params: z.object({ jobId: commonSchemas.id }),
  handler: async ({ params, request, auth }) => {
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > VIDEO_MAX_SIZE_BYTES) {
      throw validationError(
        `The render result is too large (max ${(VIDEO_MAX_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB).`,
      );
    }

    const videoBuffer = Buffer.from(await request.arrayBuffer());
    const job = await acceptJobResult(
      params.jobId,
      videoBuffer,
      auth.allowedDepartmentIds,
    );
    return {
      id: job.id,
      state: job.state,
      videoFileId: job.videoFileId,
    };
  },
});
