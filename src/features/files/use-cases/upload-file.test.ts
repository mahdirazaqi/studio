import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type * as ProbeModule from "@/server/media/probe";

const sniffContentType = vi.fn();
const probeImageDimensions = vi.fn();
const hashContent = vi.fn();
const put = vi.fn();
const del = vi.fn();
const createFile = vi.fn();
const findFileByContentHash = vi.fn();
const departmentExists = vi.fn();

vi.mock("@/server/media/probe", async () => {
  const actual = await vi.importActual<typeof ProbeModule>(
    "@/server/media/probe",
  );
  return {
    sniffContentType: (...args: unknown[]) => sniffContentType(...args),
    probeImageDimensions: (...args: unknown[]) => probeImageDimensions(...args),
    hashContent: (...args: unknown[]) => hashContent(...args),
    generateStorageName: actual.generateStorageName,
  };
});

vi.mock("@/server/adapters/storage", () => ({
  storage: {
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

vi.mock("@/features/files/repository/file-repository", () => ({
  createFile: (...args: unknown[]) => createFile(...args),
  findFileByContentHash: (...args: unknown[]) => findFileByContentHash(...args),
}));

vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentExists: (...args: unknown[]) => departmentExists(...args),
}));

const { uploadFile } = await import("./upload-file");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

function fakeFile(name: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name);
}

beforeEach(() => {
  vi.clearAllMocks();
  sniffContentType.mockResolvedValue({
    mimeType: "image/png",
    extension: "png",
  });
  probeImageDimensions.mockReturnValue({ width: 10, height: 10 });
  hashContent.mockReturnValue("hash-abc");
  put.mockResolvedValue(undefined);
  del.mockResolvedValue(undefined);
  findFileByContentHash.mockResolvedValue(null);
  departmentExists.mockResolvedValue(true);
  createFile.mockImplementation(async (data: Record<string, unknown>) => ({
    id: "file-1",
    ...data,
    uploadedByName: null,
    createdAt: new Date(),
  }));
});

describe("uploadFile", () => {
  it("uploads into the actor's own department for USER/MANAGER, ignoring a requested departmentId", async () => {
    const result = await uploadFile(actor({ departmentId: "dept-a" }), {
      file: fakeFile("logo.png", 100),
      departmentId: "dept-b",
    });
    expect(result.file.departmentId).toBe("dept-a");
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^dept-a\//),
      expect.any(Buffer),
    );
  });

  it("honors an explicit departmentId for ADMIN", async () => {
    const result = await uploadFile(
      actor({ role: "ADMIN", departmentId: "dept-a" }),
      { file: fakeFile("logo.png", 100), departmentId: "dept-b" },
    );
    expect(result.file.departmentId).toBe("dept-b");
  });

  it("rejects an ADMIN-specified department that doesn't exist", async () => {
    departmentExists.mockResolvedValue(false);
    await expect(
      uploadFile(actor({ role: "ADMIN" }), {
        file: fakeFile("logo.png", 100),
        departmentId: "nonexistent",
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized file type", async () => {
    sniffContentType.mockResolvedValue(null);
    await expect(
      uploadFile(actor(), { file: fakeFile("mystery.bin", 100) }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a type outside the allow-list", async () => {
    sniffContentType.mockResolvedValue({
      mimeType: "application/pdf",
      extension: "pdf",
    });
    await expect(
      uploadFile(actor(), { file: fakeFile("doc.pdf", 100) }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a file over its kind's size limit", async () => {
    const oversized = fakeFile("huge.png", 26 * 1024 * 1024); // > 25MB image cap
    await expect(
      uploadFile(actor(), { file: oversized }),
    ).rejects.toMatchObject({
      kind: "validation",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a corrupt image that fails dimension probing", async () => {
    probeImageDimensions.mockImplementation(() => {
      throw new Error("corrupt");
    });
    await expect(
      uploadFile(actor(), { file: fakeFile("bad.png", 100) }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(put).not.toHaveBeenCalled();
  });

  it("reports an existing file with the same content hash as an advisory duplicate, without blocking", async () => {
    findFileByContentHash.mockResolvedValue({ id: "existing-file" });
    const result = await uploadFile(actor(), {
      file: fakeFile("logo.png", 100),
    });
    expect(result.duplicateOfFileId).toBe("existing-file");
    expect(put).toHaveBeenCalled();
    expect(createFile).toHaveBeenCalled();
  });

  it("wraps a storage failure as a dependency error and never calls createFile", async () => {
    put.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      uploadFile(actor(), { file: fakeFile("logo.png", 100) }),
    ).rejects.toMatchObject({ kind: "dependency" });
    expect(createFile).not.toHaveBeenCalled();
  });

  it("cleans up the storage object when the database write fails", async () => {
    createFile.mockRejectedValueOnce(new Error("db down"));
    await expect(
      uploadFile(actor(), { file: fakeFile("logo.png", 100) }),
    ).rejects.toThrow("db down");
    expect(del).toHaveBeenCalledWith(expect.stringMatching(/^dept-a\//));
  });
});
