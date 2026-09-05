import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeFile } from "@/features/files/domain/file";

const findFileInScope = vi.fn();
const findStorageKey = vi.fn();
const deleteFileRow = vi.fn();
const storageDelete = vi.fn();

vi.mock("@/features/files/repository/file-repository", () => ({
  findFileInScope: (...args: unknown[]) => findFileInScope(...args),
  findStorageKey: (...args: unknown[]) => findStorageKey(...args),
  deleteFileRow: (...args: unknown[]) => deleteFileRow(...args),
}));

vi.mock("@/server/adapters/storage", () => ({
  storage: { delete: (...args: unknown[]) => storageDelete(...args) },
}));

const { deleteFile } = await import("./delete-file");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

const file = (overrides: Partial<SafeFile> = {}): SafeFile => ({
  id: "file-1",
  departmentId: "dept-a",
  category: "GALLERY_ASSET",
  kind: "IMAGE",
  originalName: "logo.png",
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
  findStorageKey.mockResolvedValue("dept-a/some-key.png");
  deleteFileRow.mockResolvedValue(undefined);
  storageDelete.mockResolvedValue(undefined);
});

describe("deleteFile", () => {
  it("throws not_found when the file doesn't exist or is out of scope", async () => {
    findFileInScope.mockResolvedValue(null);
    await expect(deleteFile(actor(), "missing")).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(deleteFileRow).not.toHaveBeenCalled();
  });

  it("throws forbidden for a USER deleting someone else's upload", async () => {
    findFileInScope.mockResolvedValue(
      file({ uploadedByUserId: "someone-else" }),
    );
    await expect(deleteFile(actor(), "file-1")).rejects.toMatchObject({
      kind: "forbidden",
    });
    expect(deleteFileRow).not.toHaveBeenCalled();
  });

  it("deletes the database row before the storage object", async () => {
    findFileInScope.mockResolvedValue(file());
    const callOrder: string[] = [];
    deleteFileRow.mockImplementation(async () => {
      callOrder.push("db");
    });
    storageDelete.mockImplementation(async () => {
      callOrder.push("storage");
    });

    await deleteFile(actor(), "file-1");

    expect(callOrder).toEqual(["db", "storage"]);
  });

  it("succeeds even if the storage delete fails afterwards (logged, not thrown)", async () => {
    findFileInScope.mockResolvedValue(file());
    storageDelete.mockRejectedValue(new Error("disk error"));

    await expect(deleteFile(actor(), "file-1")).resolves.toBeUndefined();
    expect(deleteFileRow).toHaveBeenCalledWith("file-1");
  });

  it("allows a MANAGER to delete a file they didn't upload", async () => {
    findFileInScope.mockResolvedValue(
      file({ uploadedByUserId: "someone-else" }),
    );
    await expect(
      deleteFile(actor({ role: "MANAGER" }), "file-1"),
    ).resolves.toBeUndefined();
  });
});
