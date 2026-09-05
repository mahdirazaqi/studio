import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeFile } from "@/features/files/domain/file";

const countTemplateAssetReferencesToFile = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  countTemplateAssetReferencesToFile: (...args: unknown[]) =>
    countTemplateAssetReferencesToFile(...args),
}));

const {
  assertCanDeleteFile,
  assertNoActiveTemplateDependencies,
  canDeleteFile,
} = await import("./authorize-file-management");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
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
  sizeBytes: 1024,
  width: 100,
  height: 100,
  uploadedByUserId: "actor-1",
  uploadedByName: "Actor One",
  createdAt: new Date(),
  ...overrides,
});

function forbidden() {
  return expect.objectContaining({ kind: "forbidden" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertCanDeleteFile", () => {
  it("allows a USER to delete their own upload", () => {
    expect(() =>
      assertCanDeleteFile(actor(), file({ uploadedByUserId: "actor-1" })),
    ).not.toThrow();
  });

  it("forbids a USER from deleting someone else's upload in the same department", () => {
    expect(() =>
      assertCanDeleteFile(actor(), file({ uploadedByUserId: "someone-else" })),
    ).toThrow(forbidden());
  });

  it("forbids a USER from deleting a file in another department", () => {
    expect(() =>
      assertCanDeleteFile(
        actor({ departmentId: "dept-a" }),
        file({ departmentId: "dept-b", uploadedByUserId: "actor-1" }),
      ),
    ).toThrow(forbidden());
  });

  it("allows a MANAGER to delete any file in their own department, not just their own", () => {
    expect(() =>
      assertCanDeleteFile(
        actor({ role: "MANAGER", departmentId: "dept-a" }),
        file({ departmentId: "dept-a", uploadedByUserId: "someone-else" }),
      ),
    ).not.toThrow();
  });

  it("forbids a MANAGER from deleting a file in another department", () => {
    expect(() =>
      assertCanDeleteFile(
        actor({ role: "MANAGER", departmentId: "dept-a" }),
        file({ departmentId: "dept-b" }),
      ),
    ).toThrow(forbidden());
  });

  it("allows ADMIN to delete any file, any department, regardless of uploader", () => {
    expect(() =>
      assertCanDeleteFile(
        actor({ role: "ADMIN", departmentId: "dept-a" }),
        file({ departmentId: "dept-b", uploadedByUserId: "someone-else" }),
      ),
    ).not.toThrow();
  });
});

describe("assertNoActiveTemplateDependencies", () => {
  it("allows deletion when no template asset references the file", async () => {
    countTemplateAssetReferencesToFile.mockResolvedValue(0);
    await expect(
      assertNoActiveTemplateDependencies(file()),
    ).resolves.toBeUndefined();
  });

  it("throws conflict when a template asset defaults to the file", async () => {
    countTemplateAssetReferencesToFile.mockResolvedValue(2);
    await expect(
      assertNoActiveTemplateDependencies(file()),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
});

describe("canDeleteFile (UI predicate)", () => {
  it("mirrors assertCanDeleteFile's decisions without throwing", () => {
    expect(canDeleteFile(actor(), file({ uploadedByUserId: "actor-1" }))).toBe(
      true,
    );
    expect(
      canDeleteFile(actor(), file({ uploadedByUserId: "someone-else" })),
    ).toBe(false);
    expect(canDeleteFile(actor(), file({ departmentId: "dept-b" }))).toBe(
      false,
    );
  });
});
