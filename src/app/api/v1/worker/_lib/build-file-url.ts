/**
 * Builds the absolute, Worker-fetchable URL for a File id, from the
 * inbound request's own origin — not `env.APP_URL` (optional, dev-only
 * today). Whatever host/scheme the Worker used to reach Studio is, by
 * construction, a host/scheme it can also use to reach `/api/files/[fileId]`
 * with its own Bearer credential (see `/api/files/[fileId]/route.ts`'s
 * Phase 7 Worker-auth branch).
 */
export function buildFileUrlFromRequest(
  request: Request,
  fileId: string,
): string {
  return `${new URL(request.url).origin}/api/files/${fileId}`;
}
