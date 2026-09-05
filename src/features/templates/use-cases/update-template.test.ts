import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import type { UpdateTemplateInput } from "@/features/templates/schemas/update-template.schema";

const findTemplateInScope = vi.fn();
const updateTemplateWithAssets = vi.fn();
const findGalleryFileIdsInDepartment = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  findTemplateInScope: (...args: unknown[]) => findTemplateInScope(...args),
  updateTemplateWithAssets: (...args: unknown[]) =>
    updateTemplateWithAssets(...args),
}));

vi.mock("@/features/files/repository/file-repository", () => ({
  findGalleryFileIdsInDepartment: (...args: unknown[]) =>
    findGalleryFileIdsInDepartment(...args),
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
  assets: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findGalleryFileIdsInDepartment.mockResolvedValue(new Set());
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
