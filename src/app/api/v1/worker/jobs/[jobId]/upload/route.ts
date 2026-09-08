import { z } from "zod";

import { defineRouteHandler } from "@/server/api";
import { authenticateWorkerLenient } from "@/server/worker-auth";
import { validationError } from "@/server/errors/app-error";
import { commonSchemas } from "@/server/validation";
import { FILE_KIND_RULES } from "@/features/files/domain/file-types";
import { acceptJobResult } from "@/features/delivery/use-cases/accept-job-result";

const VIDEO_MAX_SIZE_BYTES =
  FILE_KIND_RULES.find((rule) => rule.kind === "VIDEO")?.maxSizeBytes ?? 0;

/**
 * `POST /api/v1/worker/jobs/:id/upload` — **the actual Worker's real
 * endpoint path (ADR-0043), replacing the previously implemented
 * `.../jobs/:id/result`.** The real Worker
 * (`navaak-ae-renderer/renderer/operator/upload.go`'s `UploadJob`) builds
 * this exact path (`uploadEndpoint = "/api/v1/worker/jobs/%v/upload"`) —
 * Studio must expose what the Worker actually calls, not a differently
 * named endpoint that happens to do the same thing. There is no old `/result`
 * route kept alongside this one: nothing else in Studio (or any other real
 * client) ever called it, so keeping both would be dead, confusing
 * duplication rather than a genuine compatibility need.
 *
 * **`multipart/form-data`, not raw bytes (ADR-0043).** The originally
 * implemented `/result` route read `request.arrayBuffer()` directly,
 * assuming a raw-bytes body — the actual Worker sends a real multipart
 * request (`mime/multipart`) with the video under form field `"file"`
 * (`AddFormFile(writer, "file", ...)`), exactly like a browser file input.
 * `defineRouteHandler`'s `body` schema always assumes JSON, so — like the
 * old `/result` route before it — this handler reads the request itself
 * rather than going through that schema; here via `request.formData()`
 * (the Web Fetch API's own multipart parser, no extra dependency).
 *
 * **No Worker credential is required for this specific request — a
 * deliberate, explained compromise (ADR-0043).** The actual Worker's
 * `UploadJob` builds its `http.NewRequest` manually and never sets an
 * `Authorization` header at all, unlike every other Worker request
 * (fetch/state/progress/duration all go through `operator.Request()`, which
 * does). Requiring a Bearer credential here — matching every other Worker
 * route — makes every real upload fail outright with `401`. Compensating
 * controls, since there is no credential to check:
 *
 * 1. If an `Authorization` header **is** present anyway (a future/updated
 *    Worker), it is still validated exactly as strictly as every other
 *    Worker route (`authenticateWorkerLenient` — see its own doc comment) —
 *    this never *weakens* a real auth attempt, it only tolerates a missing
 *    one.
 * 2. Without a credential, `acceptJobResult` cannot Department-scope the
 *    Job (`allowedDepartmentIds: null`) — but it still requires the Job to
 *    currently be in `RENDERING`, or `RENDERED` with no `videoFileId` yet
 *    (the same broadened acceptance ADR-0043 needed for the Worker's own
 *    call-ordering — see that function's doc comment). A stranger cannot
 *    productively "attack" this beyond wasting a genuinely in-flight Job's
 *    render slot; Job ids are unguessable (`cuid()`), and every other
 *    content/size validation below still applies in full.
 *
 * Thin wrapper only, per the Worker-layer convention (CLAUDE.md §13): reads
 * the multipart body, calls `acceptJobResult`, maps the result. No
 * media-processing, state-machine, or delivery logic lives here.
 */
export const POST = defineRouteHandler({
  name: "worker.jobs.upload",
  authenticate: authenticateWorkerLenient,
  params: z.object({ jobId: commonSchemas.id }),
  handler: async ({ params, request, auth }) => {
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > VIDEO_MAX_SIZE_BYTES) {
      throw validationError(
        `The render result is too large (max ${(VIDEO_MAX_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB).`,
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || !(file instanceof Blob)) {
      throw validationError(
        'The render result must be uploaded as multipart/form-data with a "file" field.',
      );
    }

    const videoBuffer = Buffer.from(await file.arrayBuffer());
    const job = await acceptJobResult(
      params.jobId,
      videoBuffer,
      auth ? auth.allowedDepartmentIds : null,
    );
    return {
      id: job.id,
      state: job.state,
      videoFileId: job.videoFileId,
    };
  },
});
