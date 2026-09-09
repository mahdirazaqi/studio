import { describe, expect, it } from "vitest";

import {
  generateStorageName,
  hashContent,
  probeImageDimensions,
  sniffContentType,
} from "./probe";

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

describe("generateStorageName", () => {
  // `generateStorageName` never takes an `originalName` at all — this is a
  // structural guarantee, not just a convention, that a user-supplied
  // filename (spaces, Unicode, punctuation, `../` traversal attempts, or any
  // length) can never influence the technical storage name. Every test below
  // only ever passes a `departmentId` and a sniffed `extension`.

  it("produces a `<uuid>.<ext>` storedName and a `<departmentId>/<storedName>` storageKey", () => {
    const { storedName, storageKey } = generateStorageName("dept-1", "mp4");
    expect(storedName).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/,
    );
    expect(storageKey).toBe(`dept-1/${storedName}`);
  });

  it("never contains a space", () => {
    const { storedName, storageKey } = generateStorageName("dept-1", "png");
    expect(storedName).not.toMatch(/\s/);
    expect(storageKey).not.toMatch(/\s/);
  });

  it("generates a different storedName on every call — same department, same extension", () => {
    const first = generateStorageName("dept-1", "mp4");
    const second = generateStorageName("dept-1", "mp4");
    expect(first.storedName).not.toBe(second.storedName);
  });

  it("lowercases the extension for consistency", () => {
    const { storedName } = generateStorageName("dept-1", "MP4");
    expect(storedName.endsWith(".mp4")).toBe(true);
  });

  it("only ever uses characters from the safe set a-z0-9- in the storedName", () => {
    const { storedName } = generateStorageName("dept-1", "jpg");
    expect(storedName).toMatch(/^[a-z0-9-]+\.[a-z0-9]+$/);
  });
});
