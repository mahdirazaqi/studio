import { beforeEach, describe, expect, it, vi } from "vitest";

const findWizardState = vi.fn();
const deleteWizardState = vi.fn();

vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  findWizardState: (...args: unknown[]) => findWizardState(...args),
  deleteWizardState: (...args: unknown[]) => deleteWizardState(...args),
}));

const { loadActiveWizardState } = await import("./load-active-wizard-state");

const validPayload = {
  templateId: "tpl-1",
  templateName: "T",
  trackCount: 1,
  slots: [{ key: "slot-1", kind: "DATA" }],
  tracks: [[]],
};

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    telegramUserId: "tg-1",
    userId: "user-1",
    flow: "SINGLE_TRACK",
    step: "COLLECT_ASSETS",
    payload: validPayload,
    lastUpdateId: 42,
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadActiveWizardState", () => {
  it("returns null when there is no row", async () => {
    findWizardState.mockResolvedValue(null);
    expect(await loadActiveWizardState("tg-1")).toBeNull();
    expect(deleteWizardState).not.toHaveBeenCalled();
  });

  it("returns the parsed state for a fresh, valid row", async () => {
    findWizardState.mockResolvedValue(row());
    const result = await loadActiveWizardState("tg-1");
    expect(result).toEqual({
      userId: "user-1",
      flow: "SINGLE_TRACK",
      step: "COLLECT_ASSETS",
      payload: validPayload,
      lastUpdateId: 42,
    });
  });

  it("expires and deletes a row older than the TTL", async () => {
    const old = new Date(Date.now() - 61 * 60 * 1000); // 61 minutes ago, TTL default 60
    findWizardState.mockResolvedValue(row({ updatedAt: old }));
    const result = await loadActiveWizardState("tg-1");
    expect(result).toBeNull();
    expect(deleteWizardState).toHaveBeenCalledWith("tg-1");
  });

  it("keeps a row just inside the TTL", async () => {
    const recent = new Date(Date.now() - 59 * 60 * 1000);
    findWizardState.mockResolvedValue(row({ updatedAt: recent }));
    const result = await loadActiveWizardState("tg-1");
    expect(result).not.toBeNull();
    expect(deleteWizardState).not.toHaveBeenCalled();
  });

  it("discards and deletes a row with a corrupted payload rather than crashing", async () => {
    findWizardState.mockResolvedValue(row({ payload: { garbage: true } }));
    const result = await loadActiveWizardState("tg-1");
    expect(result).toBeNull();
    expect(deleteWizardState).toHaveBeenCalledWith("tg-1");
  });
});
