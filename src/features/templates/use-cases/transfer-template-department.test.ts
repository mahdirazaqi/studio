import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";

const findTemplateInScope = vi.fn();
const transferTemplateDepartmentRepo = vi.fn();
const departmentExists = vi.fn();
const findGalleryFileIdsInDepartment = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  findTemplateInScope: (...args: unknown[]) => findTemplateInScope(...args),
  transferTemplateDepartment: (...args: unknown[]) =>
    transferTemplateDepartmentRepo(...args),
}));

vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentExists: (...args: unknown[]) => departmentExists(...args),
}));

vi.mock("@/features/files/repository/file-repository", () => ({
  findGalleryFileIdsInDepartment: (...args: unknown[]) =>
    findGalleryFileIdsInDepartment(...args),
}));

const { transferTemplateDepartment } =
  await import("./transfer-template-department");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "admin-1",
  role: "ADMIN",
  departmentId: "dept-admin",
  ...overrides,
});

const template = (
  overrides: Partial<SafeTemplateDetail> = {},
): SafeTemplateDetail => ({
  id: "template-1",
  departmentId: "dept-a",
  name: "Weekly Highlight",
  status: "ACTIVE",
  deletedAt: null,
  assetCount: 0,
  createdByUserId: "user-1",
  createdByName: "User One",
  createdAt: new Date(),
  updatedAt: new Date(),
  composition: "main-comp",
  source: "src://project",
  scriptRef: "script.js",
  outputPattern: "out/%s.mp4",
  assets: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  departmentExists.mockResolvedValue(true);
  findGalleryFileIdsInDepartment.mockResolvedValue(new Set());
  transferTemplateDepartmentRepo.mockResolvedValue(
    template({ departmentId: "dept-b" }),
  );
});

describe("transferTemplateDepartment", () => {
  it("throws not_found when the template doesn't exist", async () => {
    findTemplateInScope.mockResolvedValue(null);
    await expect(
      transferTemplateDepartment(actor(), "template-1", "dept-b"),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(transferTemplateDepartmentRepo).not.toHaveBeenCalled();
  });

  it("lets ADMIN transfer a template to a different, existing department", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await transferTemplateDepartment(actor(), "template-1", "dept-b");
    expect(departmentExists).toHaveBeenCalledWith("dept-b");
    expect(transferTemplateDepartmentRepo).toHaveBeenCalledWith(
      "template-1",
      "dept-b",
    );
  });

  it("rejects a MANAGER's attempt to transfer, even one otherwise authorized to edit the template", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await expect(
      transferTemplateDepartment(
        actor({ role: "MANAGER", departmentId: "dept-a" }),
        "template-1",
        "dept-b",
      ),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(transferTemplateDepartmentRepo).not.toHaveBeenCalled();
  });

  it("rejects a USER's attempt to transfer", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await expect(
      transferTemplateDepartment(
        actor({ role: "USER", departmentId: "dept-a" }),
        "template-1",
        "dept-b",
      ),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(transferTemplateDepartmentRepo).not.toHaveBeenCalled();
  });

  it("rejects a transfer to a nonexistent department", async () => {
    departmentExists.mockResolvedValue(false);
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await expect(
      transferTemplateDepartment(actor(), "template-1", "dept-bogus"),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(transferTemplateDepartmentRepo).not.toHaveBeenCalled();
  });

  it("rejects transferring a soft-deleted template", async () => {
    findTemplateInScope.mockResolvedValue(
      template({ departmentId: "dept-a", deletedAt: new Date() }),
    );
    await expect(
      transferTemplateDepartment(actor(), "template-1", "dept-b"),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(transferTemplateDepartmentRepo).not.toHaveBeenCalled();
  });

  it("rejects a transfer that would orphan an asset's defaultFileId in the target department", async () => {
    findTemplateInScope.mockResolvedValue(
      template({
        departmentId: "dept-a",
        assets: [
          {
            id: "ta-1",
            key: "cover",
            kind: "IMAGE",
            composition: "c1",
            layer: "l1",
            imageRatio: "SQUARE",
            defaultFileId: "file-only-in-dept-a",
            order: 0,
          },
        ],
      }),
    );
    findGalleryFileIdsInDepartment.mockResolvedValue(new Set()); // not in dept-b
    await expect(
      transferTemplateDepartment(actor(), "template-1", "dept-b"),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(transferTemplateDepartmentRepo).not.toHaveBeenCalled();
  });

  it("is a no-op when the target department is unchanged, for ADMIN", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    const result = await transferTemplateDepartment(
      actor({ role: "ADMIN" }),
      "template-1",
      "dept-a",
    );
    expect(departmentExists).not.toHaveBeenCalled();
    expect(transferTemplateDepartmentRepo).not.toHaveBeenCalled();
    expect(result.departmentId).toBe("dept-a");
  });
});
