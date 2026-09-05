import { describe, expect, it } from "vitest";

import { resolveFileKind } from "./file-types";

describe("resolveFileKind", () => {
  it("resolves a matching mimeType + extension pair", () => {
    expect(resolveFileKind("image/png", "png")?.kind).toBe("IMAGE");
    expect(resolveFileKind("audio/mpeg", "mp3")?.kind).toBe("AUDIO");
    expect(resolveFileKind("video/mp4", "mp4")?.kind).toBe("VIDEO");
  });

  it("is case-insensitive on the extension", () => {
    expect(resolveFileKind("image/jpeg", "JPG")?.kind).toBe("IMAGE");
  });

  it("rejects a mimeType/extension mismatch across kinds", () => {
    // Sniffed bytes say video, but the extension claims mp3 — must not
    // resolve under either kind.
    expect(resolveFileKind("video/mp4", "mp3")).toBeNull();
  });

  it("rejects an unsupported mimeType entirely", () => {
    expect(resolveFileKind("application/pdf", "pdf")).toBeNull();
    expect(resolveFileKind("image/gif", "gif")).toBeNull();
  });

  it("accepts a mismatched extension within the same kind (e.g. PNG bytes named .jpg)", () => {
    // Kind-level agreement is what's enforced, not an exact format↔extension
    // pairing — the served Content-Type always comes from the sniffed
    // mimeType, never the extension, so this can't smuggle a different kind.
    expect(resolveFileKind("image/png", "jpg")?.kind).toBe("IMAGE");
  });
});
