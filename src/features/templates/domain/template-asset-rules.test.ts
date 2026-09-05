import { describe, expect, it } from "vitest";

import {
  allowsFileReference,
  checkAssetKindConsistency,
  findDuplicateAssetKey,
  requiresImageRatio,
} from "@/features/templates/domain/template-asset-rules";

describe("requiresImageRatio", () => {
  it("is true only for IMAGE", () => {
    expect(requiresImageRatio("IMAGE")).toBe(true);
    expect(requiresImageRatio("DATA")).toBe(false);
    expect(requiresImageRatio("AUDIO")).toBe(false);
    expect(requiresImageRatio("VIDEO")).toBe(false);
  });
});

describe("allowsFileReference", () => {
  it("is false only for DATA", () => {
    expect(allowsFileReference("DATA")).toBe(false);
    expect(allowsFileReference("IMAGE")).toBe(true);
    expect(allowsFileReference("AUDIO")).toBe(true);
    expect(allowsFileReference("VIDEO")).toBe(true);
  });
});

describe("checkAssetKindConsistency", () => {
  it("requires an imageRatio for IMAGE", () => {
    const issues = checkAssetKindConsistency({ kind: "IMAGE" });
    expect(issues.imageRatio).toBeDefined();
  });

  it("accepts an IMAGE with an imageRatio", () => {
    const issues = checkAssetKindConsistency({
      kind: "IMAGE",
      imageRatio: "SQUARE",
    });
    expect(issues.imageRatio).toBeUndefined();
  });

  it("rejects an imageRatio on a non-IMAGE kind", () => {
    const issues = checkAssetKindConsistency({
      kind: "AUDIO",
      imageRatio: "SQUARE",
    });
    expect(issues.imageRatio).toBeDefined();
  });

  it("rejects a defaultFileId on a DATA asset", () => {
    const issues = checkAssetKindConsistency({
      kind: "DATA",
      defaultFileId: "file_1",
    });
    expect(issues.defaultFileId).toBeDefined();
  });

  it("accepts a defaultFileId on an IMAGE/AUDIO/VIDEO asset", () => {
    for (const kind of ["IMAGE", "AUDIO", "VIDEO"] as const) {
      const issues = checkAssetKindConsistency({
        kind,
        imageRatio: kind === "IMAGE" ? "ANY" : undefined,
        defaultFileId: "file_1",
      });
      expect(issues.defaultFileId).toBeUndefined();
    }
  });

  it("returns no issues for a well-formed DATA asset", () => {
    expect(checkAssetKindConsistency({ kind: "DATA" })).toEqual({});
  });
});

describe("findDuplicateAssetKey", () => {
  it("returns null when all keys are unique", () => {
    expect(
      findDuplicateAssetKey([{ key: "a" }, { key: "b" }, { key: "c" }]),
    ).toBeNull();
  });

  it("returns the repeated key", () => {
    expect(
      findDuplicateAssetKey([{ key: "a" }, { key: "b" }, { key: "a" }]),
    ).toBe("a");
  });

  it("returns null for an empty list", () => {
    expect(findDuplicateAssetKey([])).toBeNull();
  });
});
