import { beforeEach, describe, expect, it, vi } from "vitest";

const enterCollectionPhase = vi.fn();

vi.mock("@/features/telegram/use-cases/enter-collection-phase", () => ({
  enterCollectionPhase: (...args: unknown[]) => enterCollectionPhase(...args),
}));

const { setTrackCount } = await import("./set-track-count");

const payload = {
  templateId: "tpl-1",
  templateName: "T",
  deliverToYouTube: false,
  trackCount: 1,
  slots: [],
  tracks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setTrackCount", () => {
  it("parses a valid number and hands off to enterCollectionPhase from ASK_TRACK_COUNT", async () => {
    enterCollectionPhase.mockResolvedValue({ step: "COLLECT_ASSETS", payload });
    await setTrackCount("tg-1", 3, payload, "5");
    expect(enterCollectionPhase).toHaveBeenCalledWith(
      "tg-1",
      "ASK_TRACK_COUNT",
      3,
      { ...payload, trackCount: 5 },
    );
  });

  it("trims surrounding whitespace", async () => {
    enterCollectionPhase.mockResolvedValue({ step: "COLLECT_ASSETS", payload });
    await setTrackCount("tg-1", 3, payload, "  4  ");
    expect(enterCollectionPhase).toHaveBeenCalledWith(
      "tg-1",
      "ASK_TRACK_COUNT",
      3,
      expect.objectContaining({ trackCount: 4 }),
    );
  });

  it("rejects zero", async () => {
    await expect(setTrackCount("tg-1", 3, payload, "0")).rejects.toMatchObject({
      kind: "validation",
    });
    expect(enterCollectionPhase).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric value", async () => {
    await expect(
      setTrackCount("tg-1", 3, payload, "banana"),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("rejects a value beyond MAX_ALBUM_TRACKS", async () => {
    await expect(
      setTrackCount("tg-1", 3, payload, "9999"),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("rejects a negative number", async () => {
    await expect(setTrackCount("tg-1", 3, payload, "-1")).rejects.toMatchObject(
      { kind: "validation" },
    );
  });
});
