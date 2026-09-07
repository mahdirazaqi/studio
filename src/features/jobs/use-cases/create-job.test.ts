import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeTemplateDetail } from "@/features/templates/domain/template";
import type { CreateJobInput } from "@/features/jobs/schemas/create-job.schema";

const findTemplateInScope = vi.fn();
const createJobWithAssets = vi.fn();
const resolveJobAssets = vi.fn();

vi.mock("@/features/templates/repository/template-repository", () => ({
  findTemplateInScope: (...args: unknown[]) => findTemplateInScope(...args),
}));

vi.mock("@/features/jobs/repository/job-repository", () => ({
  createJobWithAssets: (...args: unknown[]) => createJobWithAssets(...args),
}));

vi.mock("@/features/jobs/use-cases/resolve-job-assets", () => ({
  resolveJobAssets: (...args: unknown[]) => resolveJobAssets(...args),
}));

const { createJob } = await import("./create-job");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "USER",
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
  assetCount: 1,
  createdByUserId: "manager-1",
  createdByName: "Manager One",
  createdAt: new Date(),
  updatedAt: new Date(),
  composition: "c",
  source: "s",
  scriptRef: "script.js",
  outputPattern: "op",
  assets: [
    {
      id: "ta-1",
      key: "caption",
      kind: "DATA",
      composition: "c1",
      layer: "l1",
      imageRatio: null,
      defaultFileId: null,
      order: 0,
    },
  ],
  ...overrides,
});

const input = (overrides: Partial<CreateJobInput> = {}): CreateJobInput => ({
  templateId: "template-1",
  assets: [{ slotKey: "caption", text: "Hi" }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findTemplateInScope.mockResolvedValue(template());
  resolveJobAssets.mockResolvedValue({ jobAssets: [], title: "Hi" });
  createJobWithAssets.mockResolvedValue({ id: "job-1" });
});

describe("createJob", () => {
  it("throws not_found when the template doesn't exist or is out of scope", async () => {
    findTemplateInScope.mockResolvedValue(null);
    await expect(createJob(actor(), input())).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(createJobWithAssets).not.toHaveBeenCalled();
  });

  it("forbids a USER from another department (folded into not_found via findTemplateInScope)", async () => {
    // findTemplateInScope itself department-scopes; a USER targeting another
    // department's template never resolves it in the first place.
    findTemplateInScope.mockResolvedValue(null);
    await expect(
      createJob(actor({ departmentId: "dept-b" }), input()),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("rejects creation from a disabled template", async () => {
    findTemplateInScope.mockResolvedValue(template({ status: "DISABLED" }));
    await expect(createJob(actor(), input())).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(createJobWithAssets).not.toHaveBeenCalled();
  });

  it("rejects creation from a soft-deleted template", async () => {
    findTemplateInScope.mockResolvedValue(template({ deletedAt: new Date() }));
    await expect(createJob(actor(), input())).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(createJobWithAssets).not.toHaveBeenCalled();
  });

  it("creates a job in the template's department for a valid, active template", async () => {
    const result = await createJob(actor(), input());
    expect(result).toMatchObject({ id: "job-1" });
    expect(createJobWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: "dept-a",
        createdByUserId: "user-1",
        templateId: "template-1",
        title: "Hi",
      }),
    );
  });

  it("builds a snapshot capturing the template's render fields and slot definitions", async () => {
    await createJob(actor(), input());
    const call = createJobWithAssets.mock.calls[0]?.[0];
    expect(call?.snapshot).toMatchObject({
      templateId: "template-1",
      templateName: "Weekly Highlight",
      composition: "c",
      source: "s",
      scriptRef: "script.js",
      outputPattern: "op",
      assetSlotDefinitions: [
        expect.objectContaining({ key: "caption", kind: "DATA" }),
      ],
    });
  });

  it("propagates asset resolution failures without creating a job", async () => {
    resolveJobAssets.mockRejectedValue(
      Object.assign(new Error("bad asset"), { kind: "business_rule" }),
    );
    await expect(createJob(actor(), input())).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(createJobWithAssets).not.toHaveBeenCalled();
  });

  it("allows ADMIN to create a job from any department's template", async () => {
    findTemplateInScope.mockResolvedValue(template({ departmentId: "dept-b" }));
    await createJob(actor({ role: "ADMIN" }), input());
    expect(createJobWithAssets).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-b" }),
    );
  });
});
