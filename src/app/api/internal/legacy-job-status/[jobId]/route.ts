import { NextResponse } from "next/server";

import { commonSchemas } from "@/server/validation";
import { getJobLegacyCancelStatus } from "@/features/jobs/use-cases/get-job-legacy-cancel-status";

/**
 * **Internal only — never a client-facing/documented endpoint of its own.**
 * Reached exclusively via `middleware.ts`'s rewrite of the human-facing
 * `GET /jobs/:jobId` URL (ADR-0043) for the one real, non-browser caller
 * that hits that literal path: the actual Worker's mid-render cancellation
 * poll (`navaak-ae-renderer/worker/worker.go`'s `CanCancel`) —
 * `url := fmt.Sprintf("%s/jobs/%s", config.C.BaseURL, activeJobId)`,
 * checked in a loop every ~5s while a render is active, to learn whether it
 * should kill the local AfterFX process.
 *
 * **Deliberately unauthenticated — the actual Worker sends no credential on
 * this specific call** (`request.Get` in `utils/request/request.go` is a
 * plain, headerless `http.Get`). There is no Bearer token, no session, and
 * nothing else to check here. This is a genuine, explained gap in what
 * Studio can protect for this one legacy-shaped call — the response
 * deliberately carries the absolute minimum: a Job id (already known to the
 * caller) and a coarse numeric lifecycle state, nothing else (no title, no
 * Department, no assets, no snapshot). See docs/security/security.md and
 * the final compatibility report for the explicit trade-off this
 * represents.
 *
 * **Response shape is the legacy backend's exact shape, verbatim** — the
 * Worker's own `Response`/`ErrorResponse` structs
 * (`{"job":{"_id":...,"state":...}}` on success, `{"statusCode":404}` on a
 * missing Job) were written against the *old* `qtical-backend-node`
 * contract and never updated. Do not "clean this up" to match Studio's
 * usual `{error:{...}}` envelope — the Worker's `json.Unmarshal` targets
 * these exact field names (`_id`, not `id`; wrapped in `"job"`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId: rawJobId } = await params;

  const parsedId = commonSchemas.id.safeParse(rawJobId);
  if (!parsedId.success) {
    return NextResponse.json({ statusCode: 404 }, { status: 404 });
  }

  const status = await getJobLegacyCancelStatus(parsedId.data);
  if (!status) {
    return NextResponse.json({ statusCode: 404 }, { status: 404 });
  }

  return NextResponse.json(
    { job: { _id: status.id, state: status.state } },
    { status: 200 },
  );
}
