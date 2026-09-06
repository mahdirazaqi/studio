import { beforeEach, describe, expect, it, vi } from "vitest";

const enterCollectionPhase = vi.fn();

vi.mock("@/features/telegram/use-cases/enter-collection-phase", () => ({
  enterCollectionPhase: (...args: unknown[]) => enterCollectionPhase(...args),
}));

const { setDeliveryChoice } = await import("./set-delivery-choice");

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

describe("setDeliveryChoice", () => {
  it("records the delivery choice and hands off to enterCollectionPhase from ASK_DELIVERY", async () => {
    enterCollectionPhase.mockResolvedValue({ step: "COLLECT_ASSETS", payload });
    await setDeliveryChoice("tg-1", 5, payload, true);
    expect(enterCollectionPhase).toHaveBeenCalledWith(
      "tg-1",
      "ASK_DELIVERY",
      5,
      { ...payload, deliverToYouTube: true },
    );
  });

  it("records false just as validly", async () => {
    enterCollectionPhase.mockResolvedValue({ step: "COLLECT_ASSETS", payload });
    await setDeliveryChoice("tg-1", 5, payload, false);
    expect(enterCollectionPhase).toHaveBeenCalledWith(
      "tg-1",
      "ASK_DELIVERY",
      5,
      { ...payload, deliverToYouTube: false },
    );
  });
});
