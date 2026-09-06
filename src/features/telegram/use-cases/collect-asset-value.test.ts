import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";

const uploadFile = vi.fn();
const advanceWizardState = vi.fn();

vi.mock("@/features/files/use-cases/upload-file", () => ({
  uploadFile: (...args: unknown[]) => uploadFile(...args),
}));
vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  advanceWizardState: (...args: unknown[]) => advanceWizardState(...args),
}));

const { collectAssetValue } = await import("./collect-asset-value");

const actor: Actor = { userId: "user-1", role: "USER", departmentId: "dept-a" };

function payload(overrides: Partial<WizardPayload> = {}): WizardPayload {
  return {
    templateId: "tpl-1",
    templateName: "T",
    deliverToYouTube: false,
    trackCount: 1,
    slots: [
      { key: "title", kind: "DATA" },
      { key: "cover", kind: "IMAGE" },
    ],
    tracks: [[]],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  advanceWizardState.mockResolvedValue({});
});

describe("collectAssetValue", () => {
  it("accepts text for a DATA slot and asks for the next slot", async () => {
    const result = await collectAssetValue(actor, "tg-1", 1, payload(), {
      kind: "text",
      text: "My Title",
    });
    expect(result.outcome).toBe("next_slot");
    expect(result.nextSlot).toEqual({ key: "cover", kind: "IMAGE" });
    expect(result.payload.tracks).toEqual([
      [{ slotKey: "title", text: "My Title" }],
    ]);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects a file sent for a DATA slot", async () => {
    await expect(
      collectAssetValue(actor, "tg-1", 1, payload(), {
        kind: "file",
        file: new File(["x"], "x.jpg"),
      }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("rejects text sent for a file slot", async () => {
    const withCoverNext = payload({
      tracks: [[{ slotKey: "title", text: "t" }]],
    });
    await expect(
      collectAssetValue(actor, "tg-1", 1, withCoverNext, {
        kind: "text",
        text: "not a photo",
      }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("uploads a file via the real upload-file use case for a matching slot, into the actor's own department", async () => {
    uploadFile.mockResolvedValue({
      file: { id: "file-1", kind: "IMAGE" },
      duplicateOfFileId: null,
    });
    const withCoverNext = payload({
      tracks: [[{ slotKey: "title", text: "t" }]],
    });
    const incomingFile = new File(["x"], "photo.jpg");

    const result = await collectAssetValue(actor, "tg-1", 1, withCoverNext, {
      kind: "file",
      file: incomingFile,
    });

    expect(uploadFile).toHaveBeenCalledWith(actor, { file: incomingFile });
    expect(result.outcome).toBe("confirm_ready");
    expect(result.payload.tracks).toEqual([
      [
        { slotKey: "title", text: "t" },
        { slotKey: "cover", fileId: "file-1" },
      ],
    ]);
  });

  it("rejects an uploaded file whose sniffed kind doesn't match the slot (never trusts Telegram's own message type)", async () => {
    uploadFile.mockResolvedValue({
      file: { id: "file-1", kind: "VIDEO" },
      duplicateOfFileId: null,
    });
    const withCoverNext = payload({
      tracks: [[{ slotKey: "title", text: "t" }]],
    });

    await expect(
      collectAssetValue(actor, "tg-1", 1, withCoverNext, {
        kind: "file",
        file: new File(["x"], "video.mp4"),
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });

  it("advances to CONFIRM once every slot of every track is filled", async () => {
    const almostDone = payload({ tracks: [[{ slotKey: "title", text: "t" }]] });
    uploadFile.mockResolvedValue({
      file: { id: "file-1", kind: "IMAGE" },
      duplicateOfFileId: null,
    });
    const result = await collectAssetValue(actor, "tg-1", 1, almostDone, {
      kind: "file",
      file: new File(["x"], "photo.jpg"),
    });
    expect(result.outcome).toBe("confirm_ready");
  });

  it("opens the next track for an Album once the current track completes", async () => {
    const albumPayload = payload({
      slots: [{ key: "title", kind: "DATA" }],
      trackCount: 2,
      tracks: [[]],
    });
    const result = await collectAssetValue(actor, "tg-1", 1, albumPayload, {
      kind: "text",
      text: "Track 1",
    });
    expect(result.outcome).toBe("next_slot");
    expect(result.payload.tracks).toEqual([
      [{ slotKey: "title", text: "Track 1" }],
      [],
    ]);
    expect(result.nextSlot).toEqual({ key: "title", kind: "DATA" });
  });

  it("throws conflict when the step already moved on (duplicate update)", async () => {
    advanceWizardState.mockResolvedValue(null);
    await expect(
      collectAssetValue(actor, "tg-1", 1, payload(), {
        kind: "text",
        text: "My Title",
      }),
    ).rejects.toMatchObject({ kind: "conflict" });
  });

  it("throws business_rule when there is nothing left to collect", async () => {
    const done = payload({
      tracks: [
        [
          { slotKey: "title", text: "t" },
          { slotKey: "cover", fileId: "file-1" },
        ],
      ],
    });
    await expect(
      collectAssetValue(actor, "tg-1", 1, done, {
        kind: "text",
        text: "extra",
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });
});
