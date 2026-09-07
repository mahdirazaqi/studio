import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import type { UpdateTemplateInput } from "@/features/templates/schemas/update-template.schema";

const findTemplateInScope = vi.fn();
const updateTemplateWithAssets = vi.fn();
const findGalleryFileIdsInDepartment = vi.fn();
const departmentExists = vi.fn();
const findConnectedYoutubeTargetForDepartment = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  findTemplateInScope: (...args: unknown[]) => findTemplateInScope(...args),
  updateTemplateWithAssets: (...args: unknown[]) =>
    updateTemplateWithAssets(...args),
}));

vi.mock("@/features/files/repository/file-repository", () => ({
  findGalleryFileIdsInDepartment: (...args: unknown[]) =>
    findGalleryFileIdsInDepartment(...args),
}));

vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentExists: (...args: unknown[]) => departmentExists(...args),
}));

vi.mock("@/features/youtube/repository/youtube-target-repository", () => ({
  findConnectedYoutubeTargetForDepartment: (...args: unknown[]) =>
    findConnectedYoutubeTargetForDepartment(...args),
}));

const { updateTemplate } = await import("./update-template");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "MANAGER",
  departmentId: "dept-a",
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
  description: null,
  tags: [],
  youtubeTargetId: null,
  assets: [],
  ...overrides,
});

const input = (
  overrides: Partial<UpdateTemplateInput> = {},
): UpdateTemplateInput => ({
  templateId: "template-1",
  name: "Weekly Highlight v2",
  composition: "main-comp",
  source: "src://project",
  scriptRef: "script.js",
  outputPattern: "out/%s.mp4",
  description: undefined,
  tags: [],
  youtubeTargetId: undefined,
  assets: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findGalleryFileIdsInDepartment.mockResolvedValue(new Set());
  departmentExists.mockResolvedValue(true);
  findConnectedYoutubeTargetForDepartment.mockResolvedValue(null);
  updateTemplateWithAssets.mockResolvedValue(template());
});

describe("updateTemplate", () => {
  it("throws not_found when the template doesn't exist or is out of scope", async () => {
    findTemplateInScope.mockResolvedValue(null);
    await expect(updateTemplate(actor(), input())).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("forbids a USER from editing a template", async () => {
    findTemplateInScope.mockResolvedValue(template());
    await expect(
      updateTemplate(actor({ role: "USER" }), input()),
    ).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("forbids a MANAGER from editing another department's template", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-b" }));
    await expect(updateTemplate(actor(), input())).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("rejects editing a soft-deleted template", async () => {
    findTemplateInScope.mockResolvedValue(template({ deletedAt: new Date() }));
    await expect(updateTemplate(actor(), input())).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("rejects a cross-department defaultFileId", async () => {
    findTemplateInScope.mockResolvedValue(template());
    findGalleryFileIdsInDepartment.mockResolvedValue(new Set());
    await expect(
      updateTemplate(
        actor(),
        input({
          assets: [
            {
              key: "cover",
              kind: "IMAGE",
              composition: "c1",
              layer: "l1",
              imageRatio: "SQUARE",
              defaultFileId: "file-from-dept-b",
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("succeeds for an authorized, in-scope, non-deleted template", async () => {
    findTemplateInScope.mockResolvedValue(template());
    await expect(updateTemplate(actor(), input())).resolves.toMatchObject({
      id: "template-1",
    });
    expect(updateTemplateWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "template-1",
        name: "Weekly Highlight v2",
      }),
    );
  });

  it("allows ADMIN to edit any department's template", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-b" }));
    await expect(
      updateTemplate(actor({ role: "ADMIN" }), input()),
    ).resolves.toMatchObject({ id: "template-1" });
  });
});

describe("updateTemplate — Department transfer (ADR-0040)", () => {
  it("lets ADMIN transfer a template to a different, existing department", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await updateTemplate(
      actor({ role: "ADMIN" }),
      input({ departmentId: "dept-b" }),
    );
    expect(departmentExists).toHaveBeenCalledWith("dept-b");
    expect(updateTemplateWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-b" }),
    );
  });

  it("rejects a MANAGER's attempt to transfer, even one otherwise authorized to edit the template", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await expect(
      updateTemplate(
        actor({ role: "MANAGER" }),
        input({ departmentId: "dept-b" }),
      ),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("rejects a USER's attempt to transfer", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await expect(
      updateTemplate(
        actor({ role: "USER" }),
        input({ departmentId: "dept-b" }),
      ),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("rejects a transfer to a nonexistent department", async () => {
    departmentExists.mockResolvedValue(false);
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await expect(
      updateTemplate(
        actor({ role: "ADMIN" }),
        input({ departmentId: "dept-bogus" }),
      ),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("rejects a transfer that would orphan an asset's defaultFileId in the target department", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    findGalleryFileIdsInDepartment.mockResolvedValue(new Set()); // file not in dept-b
    await expect(
      updateTemplate(
        actor({ role: "ADMIN" }),
        input({
          departmentId: "dept-b",
          assets: [
            {
              key: "cover",
              kind: "IMAGE",
              composition: "c1",
              layer: "l1",
              imageRatio: "SQUARE",
              defaultFileId: "file-only-in-dept-a",
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("rejects a transfer that would orphan the youtubeTargetId in the target department", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    findConnectedYoutubeTargetForDepartment.mockResolvedValue(null); // not assigned to dept-b
    await expect(
      updateTemplate(
        actor({ role: "ADMIN" }),
        input({
          departmentId: "dept-b",
          youtubeTargetId: "target-only-in-dept-a",
        }),
      ),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(updateTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("is a no-op transfer-wise when departmentId is unchanged, even for a non-ADMIN", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-a" }));
    await updateTemplate(
      actor({ role: "MANAGER" }),
      input({ departmentId: "dept-a" }),
    );
    expect(departmentExists).not.toHaveBeenCalled();
    expect(updateTemplateWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-a" }),
    );
  });
});
