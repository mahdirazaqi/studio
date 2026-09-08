import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "./middleware";

function req(
  path: string,
  { method = "GET", accept }: { method?: string; accept?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (accept !== undefined) headers.set("accept", accept);
  return new NextRequest(new URL(path, "http://localhost"), {
    method,
    headers,
  });
}

/**
 * The real Worker's cancel poll (`CanCancel`) hits `GET {baseURL}/jobs/:id`
 * with no `Accept` header at all (a plain `http.Get`, ADR-0043) — a real
 * browser navigating to the dashboard Job detail page always sends
 * `Accept: text/html,...`. This middleware is the only thing that lets both
 * land on the same literal URL.
 */
describe("middleware — /jobs/:jobId content-negotiated rewrite", () => {
  it("rewrites a headerless GET (the Worker's real shape) to the internal legacy status route", () => {
    const response = middleware(req("/jobs/job-1"));
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/api/internal/legacy-job-status/job-1",
    );
  });

  it("rewrites a GET whose Accept header does not include text/html", () => {
    const response = middleware(
      req("/jobs/job-1", { accept: "application/json" }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/api/internal/legacy-job-status/job-1",
    );
  });

  it("does NOT rewrite a real browser navigation (Accept: text/html)", () => {
    const response = middleware(
      req("/jobs/job-1", { accept: "text/html,application/xhtml+xml" }),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does NOT rewrite a non-GET request", () => {
    const response = middleware(req("/jobs/job-1", { method: "POST" }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
