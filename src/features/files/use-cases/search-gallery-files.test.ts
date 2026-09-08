import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const listFiles = vi.fn();

vi.mock("@/features/files/repository/file-repository", () => ({
  listFiles: (...args: unknown[]) => listFiles(...args),
}));

const { searchGalleryFiles } = await import("./search-gallery-files");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  listFiles.mockResolvedValue({ items: [], page: 1, pageSize: 24, total: 0 });
});

describe("searchGalleryFiles", () => {
  it("allows a USER (file:manage's floor) to search", async () => {
    await searchGalleryFiles(actor(), { page: 1, pageSize: 24 });
    expect(listFiles).toHaveBeenCalled();
  });

  it("always searches the GALLERY_ASSET category, never JOB_ARTIFACT", async () => {
    await searchGalleryFiles(actor(), { page: 1, pageSize: 24 });
    expect(listFiles).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "GALLERY_ASSET" }),
    );
  });

  it("passes q/kind/departmentId straight through to the repository", async () => {
    await searchGalleryFiles(actor({ role: "ADMIN" }), {
      q: "logo",
      kind: "IMAGE",
      departmentId: "dept-b",
      page: 2,
      pageSize: 12,
    });
    expect(listFiles).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        q: "logo",
        kind: "IMAGE",
        departmentId: "dept-b",
        page: 2,
        pageSize: 12,
      }),
    );
  });
});
