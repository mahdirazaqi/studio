import { beforeEach, describe, expect, it, vi } from "vitest";

const findGalleryFileIdsInDepartment = vi.fn();

vi.mock("@/features/files/repository/file-repository", () => ({
  findGalleryFileIdsInDepartment: (...args: unknown[]) =>
    findGalleryFileIdsInDepartment(...args),
}));

const { verifyAssetFileReferences } = await import("./verify-file-references");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyAssetFileReferences", () => {
  it("does nothing and never queries when no asset references a file", async () => {
    await verifyAssetFileReferences("dept-a", [{ defaultFileId: undefined }]);
    expect(findGalleryFileIdsInDepartment).not.toHaveBeenCalled();
  });

  it("passes when every referenced file resolves in the department", async () => {
    findGalleryFileIdsInDepartment.mockResolvedValue(
      new Set(["file-1", "file-2"]),
    );
    await expect(
      verifyAssetFileReferences("dept-a", [
        { defaultFileId: "file-1" },
        { defaultFileId: "file-2" },
      ]),
    ).resolves.toBeUndefined();
    expect(findGalleryFileIdsInDepartment).toHaveBeenCalledWith("dept-a", [
      "file-1",
      "file-2",
    ]);
  });

  it("de-duplicates repeated file ids before querying", async () => {
    findGalleryFileIdsInDepartment.mockResolvedValue(new Set(["file-1"]));
    await verifyAssetFileReferences("dept-a", [
      { defaultFileId: "file-1" },
      { defaultFileId: "file-1" },
    ]);
    expect(findGalleryFileIdsInDepartment).toHaveBeenCalledWith("dept-a", [
      "file-1",
    ]);
  });

  it("throws business_rule when a referenced file does not resolve (e.g. another department)", async () => {
    findGalleryFileIdsInDepartment.mockResolvedValue(new Set());
    await expect(
      verifyAssetFileReferences("dept-a", [
        { defaultFileId: "file-from-dept-b" },
      ]),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });
});
