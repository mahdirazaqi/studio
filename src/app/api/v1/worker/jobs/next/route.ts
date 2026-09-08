import { defineRouteHandler } from "@/server/api";
import { authenticateWorker } from "@/server/worker-auth";
import { notFoundError } from "@/server/errors/app-error";
import { claimNextJob } from "@/features/jobs/use-cases/claim-next-job";
import { buildWorkerJobPayload } from "@/features/jobs/domain/worker-job-payload";
import { buildFileUrlFromRequest } from "@/app/api/v1/worker/_lib/build-file-url";

/**
 * Atomic Job claim (docs/integrations/worker-api.md; ADR-0029 for the
 * underlying atomicity, ADR-0043 for Worker compatibility). Deliberately
 * `POST` — claiming mutates state, and a side-effecting `GET` is exactly
 * what legacy got wrong (Security Requirements §11: "no state-changing GET
 * requests").
 *
 * **Empty-queue semantics — revised, ADR-0043.** The originally documented
 * design returned `204 No Content` for an empty queue. The **actual Worker**
 * (`navaak-ae-renderer/renderer/operator/request.go`'s `Request()`) treats
 * any status `> 300` as an error and passes the raw response body to
 * `errors.New(...)`; `renderer.go`'s polling loop then silences that error
 * only when its text contains the literal substring `"Not Found"` — a
 * pattern written for the legacy backend's `404 Not Found` empty-queue
 * response, never updated for a `204`. A `204` has no body at all, so the
 * Worker's own `json.Unmarshal` on the (empty) response fails with an
 * unrelated "unexpected end of JSON input" error that does **not** contain
 * "Not Found" — logged as a real error on every single empty poll. This
 * route now throws `notFoundError("Not Found")` instead, whose message
 * (embedded verbatim in the JSON error body) satisfies the Worker's exact
 * string check. Do not revert to `204` without re-verifying against the
 * actual Worker source — this is not a stylistic preference.
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
    if (!job) throw notFoundError("Not Found");
    return buildWorkerJobPayload(job, (fileId) =>
      buildFileUrlFromRequest(request, fileId),
    );
  },
});
