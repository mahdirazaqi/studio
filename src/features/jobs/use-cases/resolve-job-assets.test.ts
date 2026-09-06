import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SafeTemplateAsset } from "@/features/templates/domain/template";

const findGalleryFilesByIdsInDepartment = vi.fn();

vi.mock("@/features/files/repository/file-repository", () => ({
  findGalleryFilesByIdsInDepartment: (...args: unknown[]) =>
    findGalleryFilesByIdsInDepartment(...args),
}));

const { resolveJobAssets } = await import("./resolve-job-assets");

const templateAsset = (
  overrides: Partial<SafeTemplateAsset> = {},
): SafeTemplateAsset => ({
  id: "ta-1",
  key: "caption",
  kind: "DATA",
  composition: "c1",
  layer: "l1",
  imageRatio: null,
  defaultFileId: null,
  order: 0,
  ...overrides,
});

const safeFile = (overrides: Record<string, unknown> = {}) => ({
  id: "file-1",
  departmentId: "dept-a",
  category: "GALLERY_ASSET",
  kind: "IMAGE",
  originalName: "cover.png",
  mimeType: "image/png",
  sizeBytes: 100,
  width: 10,
  height: 10,
  uploadedByUserId: "u1",
  uploadedByName: null,
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findGalleryFilesByIdsInDepartment.mockResolvedValue([]);
});

describe("resolveJobAssets", () => {
  it("always injects a SCRIPT asset first", async () => {
    const result = await resolveJobAssets({
      departmentId: "dept-a",
      templateAssets: [],
      scriptRef: "script.js",
      inputAssets: [],
    });
    expect(result.jobAssets[0]).toMatchObject({
      kind: "SCRIPT",
      slotKey: null,
      textValue: "script.js",
    });
  });

  it("resolves a DATA slot and contributes to the title", async () => {
    const result = await resolveJobAssets({
      departmentId: "dept-a",
      templateAssets: [templateAsset({ key: "caption", kind: "DATA" })],
      scriptRef: "s.js",
      inputAssets: [{ slotKey: "caption", text: "Hello" }],
    });
    expect(result.title).toBe("Hello");
    expect(result.jobAssets).toHaveLength(2);
    expect(result.jobAssets[1]).toMatchObject({
      slotKey: "caption",
      kind: "DATA",
      textValue: "Hello",
    });
  });

  it("joins multiple DATA values with ' | ' in template slot order", async () => {
    const result = await resolveJobAssets({
      departmentId: "dept-a",
      templateAssets: [
        templateAsset({ key: "a", kind: "DATA" }),
        templateAsset({ key: "b", kind: "DATA" }),
      ],
      scriptRef: "s.js",
      inputAssets: [
        { slotKey: "b", text: "Second" },
        { slotKey: "a", text: "First" },
      ],
    });
    expect(result.title).toBe("First | Second");
  });

  it("throws when a required slot has no value", async () => {
    await expect(
      resolveJobAssets({
        departmentId: "dept-a",
        templateAssets: [templateAsset({ key: "caption" })],
        scriptRef: "s.js",
        inputAssets: [],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });

  it("rejects an input slotKey that isn't on the template", async () => {
    await expect(
      resolveJobAssets({
        departmentId: "dept-a",
        templateAssets: [templateAsset({ key: "caption" })],
        scriptRef: "s.js",
        inputAssets: [
          { slotKey: "caption", text: "hi" },
          { slotKey: "not-a-slot", text: "oops" },
        ],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });

  it("resolves a file-kind slot from the department's gallery", async () => {
    findGalleryFilesByIdsInDepartment.mockResolvedValue([safeFile()]);
    const result = await resolveJobAssets({
      departmentId: "dept-a",
      templateAssets: [
        templateAsset({ key: "cover", kind: "IMAGE", imageRatio: "ANY" }),
      ],
      scriptRef: "s.js",
      inputAssets: [{ slotKey: "cover", fileId: "file-1" }],
    });
    expect(result.jobAssets[1]).toMatchObject({
      slotKey: "cover",
      kind: "IMAGE",
      fileId: "file-1",
      fileOriginalName: "cover.png",
      fileMimeType: "image/png",
      fileSizeBytes: 100,
      fileWidth: 10,
      fileHeight: 10,
    });
  });

  it("rejects a fileId that does not resolve in the department (cross-department or deleted)", async () => {
    findGalleryFilesByIdsInDepartment.mockResolvedValue([]);
    await expect(
      resolveJobAssets({
        departmentId: "dept-a",
        templateAssets: [
          templateAsset({ key: "cover", kind: "IMAGE", imageRatio: "ANY" }),
        ],
        scriptRef: "s.js",
        inputAssets: [{ slotKey: "cover", fileId: "file-from-dept-b" }],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });

  it("rejects a file whose kind doesn't match the slot's kind", async () => {
    findGalleryFilesByIdsInDepartment.mockResolvedValue([
      safeFile({ kind: "AUDIO" }),
    ]);
    await expect(
      resolveJobAssets({
        departmentId: "dept-a",
        templateAssets: [
          templateAsset({ key: "cover", kind: "IMAGE", imageRatio: "ANY" }),
        ],
        scriptRef: "s.js",
        inputAssets: [{ slotKey: "cover", fileId: "file-1" }],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });

  it("rejects a DATA slot submitted with no text", async () => {
    await expect(
      resolveJobAssets({
        departmentId: "dept-a",
        templateAssets: [templateAsset({ key: "caption", kind: "DATA" })],
        scriptRef: "s.js",
        inputAssets: [{ slotKey: "caption", fileId: "file-1" }],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });

  it("rejects a file-kind slot submitted with no fileId", async () => {
    await expect(
      resolveJobAssets({
        departmentId: "dept-a",
        templateAssets: [
          templateAsset({ key: "cover", kind: "IMAGE", imageRatio: "ANY" }),
        ],
        scriptRef: "s.js",
        inputAssets: [{ slotKey: "cover", text: "not a file" }],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });
});
