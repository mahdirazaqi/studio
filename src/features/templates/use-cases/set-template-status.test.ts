import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";

const findTemplateInScope = vi.fn();
const setTemplateStatusRepo = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  findTemplateInScope: (...args: unknown[]) => findTemplateInScope(...args),
  setTemplateStatus: (...args: unknown[]) => setTemplateStatusRepo(...args),
}));

const { disableTemplate, enableTemplate } =
  await import("./set-template-status");

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
  description: null,
  tags: [],
  youtubeTargetId: null,
  assets: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enableTemplate / disableTemplate", () => {
  it("throws not_found when out of scope", async () => {
    findTemplateInScope.mockResolvedValue(null);
    await expect(disableTemplate(actor(), "template-1")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("forbids a USER", async () => {
    findTemplateInScope.mockResolvedValue(template());
    await expect(
      disableTemplate(actor({ role: "USER" }), "template-1"),
    ).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("disables an active template", async () => {
    findTemplateInScope.mockResolvedValue(template({ status: "ACTIVE" }));
    await disableTemplate(actor(), "template-1");
    expect(setTemplateStatusRepo).toHaveBeenCalledWith(
      "template-1",
      "DISABLED",
    );
  });

  it("enables a disabled template", async () => {
    findTemplateInScope.mockResolvedValue(template({ status: "DISABLED" }));
    await enableTemplate(actor(), "template-1");
    expect(setTemplateStatusRepo).toHaveBeenCalledWith("template-1", "ACTIVE");
  });

  it("is idempotent — disabling an already-disabled template is a no-op", async () => {
    findTemplateInScope.mockResolvedValue(template({ status: "DISABLED" }));
    await disableTemplate(actor(), "template-1");
    expect(setTemplateStatusRepo).not.toHaveBeenCalled();
  });

  it("rejects enabling a soft-deleted template", async () => {
    findTemplateInScope.mockResolvedValue(
      template({ status: "DISABLED", deletedAt: new Date() }),
    );
    await expect(enableTemplate(actor(), "template-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(setTemplateStatusRepo).not.toHaveBeenCalled();
  });
});
