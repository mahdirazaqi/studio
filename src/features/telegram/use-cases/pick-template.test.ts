import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const getTemplateForJobForm = vi.fn();
const startWizardState = vi.fn();

vi.mock("@/features/jobs/use-cases/get-template-for-job-form", () => ({
  getTemplateForJobForm: (...args: unknown[]) => getTemplateForJobForm(...args),
}));
vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  startWizardState: (...args: unknown[]) => startWizardState(...args),
}));

const { pickTemplate } = await import("./pick-template");

const actor: Actor = { userId: "user-1", role: "USER", departmentId: "dept-a" };

const template = {
  id: "tpl-1",
  name: "Podcast Intro",
  assets: [
    { key: "title", kind: "DATA" },
    { key: "cover", kind: "IMAGE" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pickTemplate", () => {
  it("propagates get-template-for-job-form's own authorization/state errors unchanged", async () => {
    getTemplateForJobForm.mockRejectedValue(
      Object.assign(new Error("not found"), { kind: "not_found" }),
    );
    await expect(
      pickTemplate(actor, "tg-1", 1, "SINGLE_TRACK", "tpl-x"),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(startWizardState).not.toHaveBeenCalled();
  });

  it("Single Track opens COLLECT_ASSETS immediately (no delivery question, ADR-0041), snapshotting the slots", async () => {
    getTemplateForJobForm.mockResolvedValue(template);
    const result = await pickTemplate(
      actor,
      "tg-1",
      7,
      "SINGLE_TRACK",
      "tpl-1",
    );

    expect(result).toEqual({
      templateName: "Podcast Intro",
      step: "COLLECT_ASSETS",
      payload: {
        templateId: "tpl-1",
        templateName: "Podcast Intro",
        trackCount: 1,
        slots: [
          { key: "title", kind: "DATA" },
          { key: "cover", kind: "IMAGE" },
        ],
        tracks: [[]],
      },
    });
    expect(startWizardState).toHaveBeenCalledWith({
      telegramUserId: "tg-1",
      userId: "user-1",
      flow: "SINGLE_TRACK",
      step: "COLLECT_ASSETS",
      payload: expect.objectContaining({ tracks: [[]] }),
      lastUpdateId: 7,
    });
  });

  it("Single Track skips straight to CONFIRM for a zero-asset template", async () => {
    getTemplateForJobForm.mockResolvedValue({ ...template, assets: [] });
    const result = await pickTemplate(
      actor,
      "tg-1",
      7,
      "SINGLE_TRACK",
      "tpl-1",
    );

    expect(result.step).toBe("CONFIRM");
    expect(startWizardState).toHaveBeenCalledWith(
      expect.objectContaining({ step: "CONFIRM" }),
    );
  });

  it("starts an ASK_TRACK_COUNT wizard row for Album", async () => {
    getTemplateForJobForm.mockResolvedValue(template);
    const result = await pickTemplate(actor, "tg-1", 7, "ALBUM", "tpl-1");

    expect(result.step).toBe("ASK_TRACK_COUNT");
    expect(startWizardState).toHaveBeenCalledWith(
      expect.objectContaining({ flow: "ALBUM", step: "ASK_TRACK_COUNT" }),
    );
  });
});
