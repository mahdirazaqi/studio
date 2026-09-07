import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";

const findTemplateInScope = vi.fn();
const softDeleteTemplateRepo = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  findTemplateInScope: (...args: unknown[]) => findTemplateInScope(...args),
  softDeleteTemplate: (...args: unknown[]) => softDeleteTemplateRepo(...args),
}));

const { softDeleteTemplate } = await import("./soft-delete-template");

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
  composition: "c",
  source: "s",
  scriptRef: "sr",
  outputPattern: "op",
  assets: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("softDeleteTemplate", () => {
  it("throws not_found when out of scope", async () => {
    findTemplateInScope.mockResolvedValue(null);
    await expect(
      softDeleteTemplate(actor(), "template-1"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("forbids a USER", async () => {
    findTemplateInScope.mockResolvedValue(template());
    await expect(
      softDeleteTemplate(actor({ role: "USER" }), "template-1"),
    ).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("forbids a MANAGER from another department", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-b" }));
    await expect(
      softDeleteTemplate(actor(), "template-1"),
    ).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("soft-deletes an active template", async () => {
    findTemplateInScope.mockResolvedValue(template());
    await softDeleteTemplate(actor(), "template-1");
    expect(softDeleteTemplateRepo).toHaveBeenCalledWith("template-1", "user-1");
  });

  it("is idempotent — deleting an already-deleted template succeeds without re-deleting", async () => {
    findTemplateInScope.mockResolvedValue(template({ deletedAt: new Date() }));
    await expect(
      softDeleteTemplate(actor(), "template-1"),
    ).resolves.toBeUndefined();
    expect(softDeleteTemplateRepo).not.toHaveBeenCalled();
  });

  it("allows ADMIN to soft-delete any department's template", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-b" }));
    await softDeleteTemplate(actor({ role: "ADMIN" }), "template-1");
    expect(softDeleteTemplateRepo).toHaveBeenCalledWith("template-1", "user-1");
  });
});
