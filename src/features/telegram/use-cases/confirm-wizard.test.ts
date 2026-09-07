import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import { businessRuleError } from "@/server/errors/app-error";

const createJob = vi.fn();
const advanceWizardState = vi.fn();
const deleteWizardState = vi.fn();

vi.mock("@/features/jobs/use-cases/create-job", () => ({
  createJob: (...args: unknown[]) => createJob(...args),
}));
vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  advanceWizardState: (...args: unknown[]) => advanceWizardState(...args),
  deleteWizardState: (...args: unknown[]) => deleteWizardState(...args),
}));

const { confirmWizard } = await import("./confirm-wizard");

const actor: Actor = { userId: "user-1", role: "USER", departmentId: "dept-a" };

const payload = {
  templateId: "tpl-1",
  templateName: "T",
  trackCount: 2,
  slots: [{ key: "title", kind: "DATA" as const }],
  tracks: [
    [{ slotKey: "title", text: "Track 1" }],
    [{ slotKey: "title", text: "Track 2" }],
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmWizard", () => {
  it("cancels without creating anything when not confirmed", async () => {
    const result = await confirmWizard(actor, "tg-1", 1, payload, false);
    expect(result).toEqual({ outcome: "cancelled" });
    expect(deleteWizardState).toHaveBeenCalledWith("tg-1");
    expect(advanceWizardState).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("reports already_processing when the CONFIRM->CREATING step change loses the race (duplicate confirm)", async () => {
    advanceWizardState.mockResolvedValue(null);
    const result = await confirmWizard(actor, "tg-1", 1, payload, true);
    expect(result).toEqual({ outcome: "already_processing" });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("creates one job per track, in order, and clears the wizard row", async () => {
    advanceWizardState.mockResolvedValue({});
    createJob
      .mockResolvedValueOnce({ id: "job-1" })
      .mockResolvedValueOnce({ id: "job-2" });

    const result = await confirmWizard(actor, "tg-1", 1, payload, true);

    expect(createJob).toHaveBeenNthCalledWith(1, actor, {
      templateId: "tpl-1",
      assets: [{ slotKey: "title", text: "Track 1" }],
    });
    expect(createJob).toHaveBeenNthCalledWith(2, actor, {
      templateId: "tpl-1",
      assets: [{ slotKey: "title", text: "Track 2" }],
    });
    expect(result).toEqual({
      outcome: "completed",
      createdJobs: [{ id: "job-1" }, { id: "job-2" }],
      totalRequested: 2,
      failureMessage: null,
    });
    expect(deleteWizardState).toHaveBeenCalledWith("tg-1");
  });

  it("stops at the first failure and reports partial success, never claiming full success", async () => {
    advanceWizardState.mockResolvedValue({});
    createJob
      .mockResolvedValueOnce({ id: "job-1" })
      .mockRejectedValueOnce(businessRuleError("quota exceeded"));

    const result = await confirmWizard(actor, "tg-1", 1, payload, true);

    expect(createJob).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      outcome: "completed",
      createdJobs: [{ id: "job-1" }],
      totalRequested: 2,
      failureMessage: "quota exceeded",
    });
    expect(deleteWizardState).toHaveBeenCalledWith("tg-1");
  });
});
