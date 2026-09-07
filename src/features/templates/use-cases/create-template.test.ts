import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { TemplateInput } from "@/features/templates/schemas/template-input.schema";

const createTemplateWithAssets = vi.fn();
const departmentExists = vi.fn();
const findGalleryFileIdsInDepartment = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  createTemplateWithAssets: (...args: unknown[]) =>
    createTemplateWithAssets(...args),
}));

vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentExists: (...args: unknown[]) => departmentExists(...args),
}));

vi.mock("@/features/files/repository/file-repository", () => ({
  findGalleryFileIdsInDepartment: (...args: unknown[]) =>
    findGalleryFileIdsInDepartment(...args),
}));

const { createTemplate } = await import("./create-template");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "MANAGER",
  departmentId: "dept-a",
  ...overrides,
});

const input = (overrides: Partial<TemplateInput> = {}): TemplateInput => ({
  name: "Weekly Highlight",
  composition: "main-comp",
  source: "src://project",
  scriptRef: "script.js",
  outputPattern: "out/%s.mp4",
  assets: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findGalleryFileIdsInDepartment.mockResolvedValue(new Set());
  createTemplateWithAssets.mockResolvedValue({
    id: "template-1",
    departmentId: "dept-a",
  });
});

describe("createTemplate", () => {
  it("forbids a USER from creating a template", async () => {
    await expect(
      createTemplate(actor({ role: "USER" }), input()),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(createTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("allows a MANAGER to create a template in their own department", async () => {
    await expect(createTemplate(actor(), input())).resolves.toMatchObject({
      id: "template-1",
    });
    expect(createTemplateWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: "dept-a",
        createdByUserId: "user-1",
      }),
    );
  });

  it("ignores a client-supplied departmentId from a non-ADMIN and uses their own", async () => {
    // Mirrors `features/files/use-cases/upload-file.ts`'s
    // `resolveTargetDepartment`: a MANAGER/USER's department is always their
    // own, silently — the request never gets a chance to name a foreign
    // department at all, let alone be rejected for it.
    await createTemplate(actor(), input({ departmentId: "dept-b" }));
    expect(createTemplateWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-a" }),
    );
  });

  it("lets ADMIN create a template in an explicit, existing department", async () => {
    departmentExists.mockResolvedValue(true);
    await createTemplate(
      actor({ role: "ADMIN", departmentId: "dept-admin" }),
      input({ departmentId: "dept-b" }),
    );
    expect(createTemplateWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-b" }),
    );
  });

  it("rejects ADMIN targeting a department that doesn't exist", async () => {
    departmentExists.mockResolvedValue(false);
    await expect(
      createTemplate(
        actor({ role: "ADMIN", departmentId: "dept-admin" }),
        input({ departmentId: "nope" }),
      ),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(createTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("rejects a defaultFileId that does not resolve in the target department", async () => {
    findGalleryFileIdsInDepartment.mockResolvedValue(new Set());
    await expect(
      createTemplate(
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
    expect(createTemplateWithAssets).not.toHaveBeenCalled();
  });

  it("accepts a defaultFileId that does resolve in the target department", async () => {
    findGalleryFileIdsInDepartment.mockResolvedValue(new Set(["file-1"]));
    await createTemplate(
      actor(),
      input({
        assets: [
          {
            key: "cover",
            kind: "IMAGE",
            composition: "c1",
            layer: "l1",
            imageRatio: "SQUARE",
            defaultFileId: "file-1",
          },
        ],
      }),
    );
    expect(createTemplateWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        assets: [expect.objectContaining({ defaultFileId: "file-1" })],
      }),
    );
  });
});
