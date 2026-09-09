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

  // ADR-0047 — the filename must reach the Worker exactly as typed. Its own
  // `net/url` machinery percent-encodes `u.Path` (which this string becomes)
  // exactly once when building the request; pre-encoding here would produce
  // a literal `%` that gets encoded *again* (`%20` -> `%2520`), which is
  // exactly the mangled-URL/garbled-local-filename bug a real render log
  // confirmed.
  it("keeps spaces and punctuation literal — never percent-encodes them", () => {
    expect(
      buildFileUrlFromRequest(req, "file-1", "Screenshot from 2026-02-09.png"),
    ).toBe("/api/files/file-1/Screenshot from 2026-02-09.png");
  });

  it("keeps Unicode (e.g. Persian) filenames literal", () => {
    expect(buildFileUrlFromRequest(req, "file-1", "ویدیوی نهایی.mp4")).toBe(
      "/api/files/file-1/ویدیوی نهایی.mp4",
    );
  });

  it("neutralizes a slash so it can never inject an extra path segment", () => {
    expect(buildFileUrlFromRequest(req, "file-1", "weird/name.jpg")).toBe(
      "/api/files/file-1/weird_name.jpg",
    );
    expect(buildFileUrlFromRequest(req, "file-1", "weird\\name.jpg")).toBe(
      "/api/files/file-1/weird_name.jpg",
    );
  });

  it("neutralizes '..' and '/' together so the Worker's own path.Clean can never escape /api/files/{id}", () => {
    expect(buildFileUrlFromRequest(req, "file-1", "../../secret.png")).toBe(
      "/api/files/file-1/____secret.png",
    );
  });

  // The real Worker's renderer runs on Windows (`C:\Renderer\temp\...` in its
  // own log output) — `filepath.Base(addr)` becomes a literal local filename
  // passed to `os.Create`, which fails outright on any of these characters.
  it("neutralizes characters illegal in a Windows filename", () => {
    expect(
      buildFileUrlFromRequest(req, "file-1", 'weird:name?"with*chars<>|.png'),
    ).toBe("/api/files/file-1/weird_name__with_chars___.png");
  });
});
