import { describe, expect, it } from "vitest";

import { buildFileUrlFromRequest } from "./build-file-url";

const req = new Request("http://localhost/api/v1/worker/jobs/next");

describe("buildFileUrlFromRequest", () => {
  it("returns a bare relative path with no filename hint", () => {
    expect(buildFileUrlFromRequest(req, "file-1")).toBe("/api/files/file-1");
  });

  it("returns the same bare path for a null/undefined hint", () => {
    expect(buildFileUrlFromRequest(req, "file-1", null)).toBe(
      "/api/files/file-1",
    );
    expect(buildFileUrlFromRequest(req, "file-1", undefined)).toBe(
      "/api/files/file-1",
    );
  });

  it("returns the same bare path for an empty-string hint", () => {
    expect(buildFileUrlFromRequest(req, "file-1", "")).toBe(
      "/api/files/file-1",
    );
  });

  // ADR-0044 — the real Worker's downloader saves the file locally under
  // the URL's last path segment; a bare fileId has no extension.
  it("appends the filename hint as an extra path segment (ADR-0044) — gives the Worker's local copy a real extension", () => {
    expect(buildFileUrlFromRequest(req, "file-1", "cover.png")).toBe(
      "/api/files/file-1/cover.png",
    );
  });

  it("URL-encodes the filename hint so it can never inject an extra path segment", () => {
    expect(
      buildFileUrlFromRequest(req, "file-1", "weird/name?with spaces.jpg"),
    ).toBe("/api/files/file-1/weird%2Fname%3Fwith%20spaces.jpg");
  });
});
