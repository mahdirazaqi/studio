import { beforeEach, describe, expect, it, vi } from "vitest";

const advanceWizardState = vi.fn();

vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  advanceWizardState: (...args: unknown[]) => advanceWizardState(...args),
}));

const { enterCollectionPhase } = await import("./enter-collection-phase");

const basePayload = {
  templateId: "tpl-1",
  templateName: "T",
  trackCount: 1,
  slots: [{ key: "s1", kind: "DATA" as const }],
  tracks: [] as { slotKey: string }[][],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enterCollectionPhase", () => {
  it("moves to COLLECT_ASSETS when the Template has slots to fill", async () => {
    advanceWizardState.mockResolvedValue({});
    const result = await enterCollectionPhase(
      "tg-1",
      "ASK_TRACK_COUNT",
      1,
      basePayload,
    );
    expect(result.step).toBe("COLLECT_ASSETS");
    expect(result.payload.tracks).toEqual([[]]);
    expect(advanceWizardState).toHaveBeenCalledWith(
      "tg-1",
      ["ASK_TRACK_COUNT"],
      "COLLECT_ASSETS",
      expect.objectContaining({ tracks: [[]] }),
      1,
    );
  });

  it("skips straight to CONFIRM for a zero-asset Template", async () => {
    advanceWizardState.mockResolvedValue({});
    const zeroSlotPayload = { ...basePayload, slots: [] };
    const result = await enterCollectionPhase(
      "tg-1",
      "ASK_TRACK_COUNT",
      1,
      zeroSlotPayload,
    );
    expect(result.step).toBe("CONFIRM");
  });

  it("throws conflict when the step already moved on (duplicate update)", async () => {
    advanceWizardState.mockResolvedValue(null);
    await expect(
      enterCollectionPhase("tg-1", "ASK_TRACK_COUNT", 1, basePayload),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
});
