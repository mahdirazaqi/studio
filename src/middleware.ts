import { NextResponse, type NextRequest } from "next/server";

/**
 * **Not authorization — a pure content-negotiation route rewrite (ADR-0043).
 * CLAUDE.md's "do not implement authorization in Next.js middleware" rule is
 * about *authorization decisions*; nothing here makes one — the request this
 * matches carries no credential to make a decision about at all.**
 *
 * The actual Worker's mid-render cancellation poll
 * (`navaak-ae-renderer/worker/worker.go`'s `CanCancel`) hits the literal URL
 * `GET {baseURL}/jobs/:id` — no `/api` prefix, unauthenticated, expecting the
 * legacy backend's `{"job":{"_id":...,"state":...}}` shape (see
 * `src/app/api/internal/legacy-job-status/[jobId]/route.ts`'s doc comment
 * for the full mechanism). That exact URL is already the human-facing Job
 * detail dashboard page (`src/app/(dashboard)/jobs/[jobId]/page.tsx`) — a
 * `page.tsx` and a `route.ts` cannot both resolve the same path in the App
 * Router, so the Worker's literal, unmodifiable URL cannot be a second
 * co-located Route Handler. This middleware is the one place that
 * distinguishes the two real callers of `/jobs/:jobId` and rewrites only the
 * machine one to the internal JSON handler — the dashboard page and its
 * session/authorization checks are completely untouched for every other
 * request.
 *
 * **Distinguishing heuristic**: a real browser navigating to this URL always
 * sends `Accept: text/html,...`; the Worker's plain `http.Get` (via
 * `utils/request/request.go`) sets no `Accept` header at all. `GET` only —
 * the dashboard page never receives anything else at this path anyway.
 * Every other route is untouched (see `matcher` below — scoped to exactly
 * `/jobs/:jobId`, not `/jobs`, `/jobs/new`, or any deeper path).
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.method !== "GET") return NextResponse.next();

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return NextResponse.next();

  const jobId = request.nextUrl.pathname.split("/")[2];
  if (!jobId) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/api/internal/legacy-job-status/${jobId}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/jobs/:jobId",
};
