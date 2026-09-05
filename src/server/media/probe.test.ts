import { describe, expect, it } from "vitest";

import { hashContent, probeImageDimensions, sniffContentType } from "./probe";

// A real 1x1 transparent PNG, so `file-type`/`image-size` see valid magic
// bytes/structure rather than us hand-rolling a fake header.
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("sniffContentType", () => {
  it("identifies a real PNG from its magic bytes", async () => {
    await expect(sniffContentType(ONE_PIXEL_PNG)).resolves.toEqual({
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("ignores a claimed extension and looks only at the bytes — text is not an image", async () => {
    const fakeImage = Buffer.from("just some plain text, not an image");
    await expect(sniffContentType(fakeImage)).resolves.toBeNull();
  });

  it("is not fooled by a PNG's bytes renamed with an unrelated extension", async () => {
    // The sniffer only reports what the bytes actually are — the caller
    // (resolveFileKind) is responsible for rejecting a mismatch against
    // whatever extension was claimed.
    const result = await sniffContentType(ONE_PIXEL_PNG);
    expect(result?.mimeType).toBe("image/png");
  });
});

describe("probeImageDimensions", () => {
  it("reads width/height from a real image", () => {
    expect(probeImageDimensions(ONE_PIXEL_PNG)).toEqual({
      width: 1,
      height: 1,
    });
  });

  it("throws for data that isn't a decodable image", () => {
    expect(() =>
      probeImageDimensions(Buffer.from("not an image at all")),
    ).toThrow();
  });
});

describe("hashContent", () => {
  it("is deterministic for identical bytes", () => {
    expect(hashContent(ONE_PIXEL_PNG)).toBe(
      hashContent(Buffer.from(ONE_PIXEL_PNG)),
    );
  });

  it("differs for different bytes", () => {
    expect(hashContent(ONE_PIXEL_PNG)).not.toBe(
      hashContent(Buffer.from("different content")),
    );
  });

  it("produces a 64-character hex digest (SHA-256)", () => {
    expect(hashContent(ONE_PIXEL_PNG)).toMatch(/^[0-9a-f]{64}$/);
  });
});
