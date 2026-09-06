import { beforeEach, describe, expect, it, vi } from "vitest";

import { dependencyError } from "@/server/errors/app-error";
import type { SafeJobDetail } from "@/features/jobs/domain/job";

const transitionJob = vi.fn();
const createPendingDeliveryAttempt = vi.fn();
const completeDeliveryAttempt = vi.fn();
const sendJobNotification = vi.fn();
const deliverToYoutube = vi.fn();
const readFileBufferForDelivery = vi.fn();
const findTelegramUserIdForUser = vi.fn();

vi.mock("@/features/jobs/use-cases/transition-job", () => ({
  transitionJob: (...args: unknown[]) => transitionJob(...args),
}));
vi.mock("@/features/delivery/repository/delivery-repository", () => ({
  createPendingDeliveryAttempt: (...args: unknown[]) =>
    createPendingDeliveryAttempt(...args),
  completeDeliveryAttempt: (...args: unknown[]) =>
    completeDeliveryAttempt(...args),
}));
vi.mock(
  "@/features/delivery/infrastructure/telegram/telegram-delivery-adapter",
  () => ({
    sendJobNotification: (...args: unknown[]) => sendJobNotification(...args),
  }),
);
vi.mock(
  "@/features/delivery/infrastructure/youtube/youtube-delivery-adapter",
  () => ({
    deliverToYoutube: (...args: unknown[]) => deliverToYoutube(...args),
  }),
);
vi.mock("@/features/files/use-cases/read-file-buffer-for-delivery", () => ({
  readFileBufferForDelivery: (...args: unknown[]) =>
    readFileBufferForDelivery(...args),
}));
vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  findTelegramUserIdForUser: (...args: unknown[]) =>
    findTelegramUserIdForUser(...args),
}));

const { deliverJobResult } = await import("./deliver-job-result");

const job = (overrides: Partial<SafeJobDetail> = {}): SafeJobDetail => ({
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Job title",
  state: "RENDERED",
  progress: 100,
  durationSeconds: 42,
  deliverToYouTube: false,
  retryOfJobId: null,
  attemptNumber: 1,
  createdByUserId: "user-1",
  createdByName: "User One",
  errorReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot: {
    templateId: "template-1",
    templateName: "T",
    composition: "c",
    source: "s",
    scriptRef: "s.js",
    outputPattern: "op",
    description: "desc",
    tags: ["{{artist}}"],
    assetSlotDefinitions: [],
    youtubeTarget: null,
  },
  assets: [
    {
      id: "a1",
      slotKey: "artist",
      kind: "DATA",
      composition: null,
      layer: "artist",
      textValue: "The Band",
      fileId: null,
      fileOriginalName: null,
      fileMimeType: null,
      fileSizeBytes: null,
      fileWidth: null,
      fileHeight: null,
      order: 1,
    },
  ],
  retriedByUserId: null,
  retriedByName: null,
  retryReason: null,
  canceledByUserId: null,
  canceledByName: null,
  canceledAt: null,
  cancelReason: null,
  claimedAt: null,
  startedAt: null,
  renderedAt: new Date(),
  deliveredAt: null,
  uploadedAt: null,
  videoFileId: "file-video",
  screenshotFileId: "file-screenshot",
  thumbnailFileId: "file-thumbnail",
  deliveryAttempts: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findTelegramUserIdForUser.mockResolvedValue(null);
  readFileBufferForDelivery.mockResolvedValue(Buffer.from("bytes"));
  createPendingDeliveryAttempt.mockResolvedValue("attempt-1");
});

describe("deliverJobResult", () => {
  it("with no YouTube target configured, goes straight RENDERED -> UPLOADED (no delivery needed)", async () => {
    transitionJob.mockResolvedValueOnce(job({ state: "UPLOADED" }));
    const result = await deliverJobResult(job());
    expect(transitionJob).toHaveBeenCalledWith(
      "job-1",
      "UPLOADED",
      expect.objectContaining({
        deliveredAt: expect.any(Date),
        uploadedAt: expect.any(Date),
      }),
    );
    expect(result.state).toBe("UPLOADED");
    expect(deliverToYoutube).not.toHaveBeenCalled();
  });

  it("notifies the linked creator's Telegram at rendered and uploaded, in order, when no YouTube delivery is needed", async () => {
    findTelegramUserIdForUser.mockResolvedValue("tg-123");
    transitionJob.mockResolvedValueOnce(job({ state: "UPLOADED" }));
    await deliverJobResult(job());
    expect(sendJobNotification).toHaveBeenCalledTimes(2);
    expect(sendJobNotification.mock.calls[0]).toEqual([
      "tg-123",
      expect.stringContaining("rendered successfully"),
    ]);
    expect(sendJobNotification.mock.calls[1]).toEqual([
      "tg-123",
      expect.stringContaining("uploaded successfully"),
    ]);
  });

  it("never calls Telegram for an unlinked creator (best-effort, not an error)", async () => {
    transitionJob.mockResolvedValueOnce(job({ state: "UPLOADED" }));
    await deliverJobResult(job());
    expect(sendJobNotification).not.toHaveBeenCalled();
  });

  it("delivers to YouTube when configured: DELIVERING -> UPLOADED, records a SUCCEEDED attempt with substituted tags", async () => {
    const withTarget = job({
      deliverToYouTube: true,
      snapshot: {
        ...job().snapshot,
        youtubeTarget: {
          id: "target-1",
          name: "Main",
          youtubeChannelId: "UC1",
        },
      },
    });
    transitionJob
      .mockResolvedValueOnce(job({ ...withTarget, state: "DELIVERING" })) // RENDERED -> DELIVERING
      .mockResolvedValueOnce(job({ ...withTarget, state: "UPLOADED" })); // DELIVERING -> UPLOADED
    deliverToYoutube.mockResolvedValue({ videoId: "yt-video-1" });

    const result = await deliverJobResult(withTarget);

    expect(transitionJob).toHaveBeenNthCalledWith(
      1,
      "job-1",
      "DELIVERING",
      expect.objectContaining({ deliveredAt: expect.any(Date) }),
    );
    expect(createPendingDeliveryAttempt).toHaveBeenCalledWith({
      jobId: "job-1",
      provider: "YOUTUBE",
      attemptNumber: 1,
      triggeredByUserId: null,
    });
    expect(deliverToYoutube).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeTargetId: "target-1",
        tags: ["The Band"], // {{artist}} substituted
      }),
    );
    expect(completeDeliveryAttempt).toHaveBeenCalledWith("attempt-1", {
      status: "SUCCEEDED",
      providerRef: "yt-video-1",
    });
    expect(transitionJob).toHaveBeenNthCalledWith(
      2,
      "job-1",
      "UPLOADED",
      expect.objectContaining({ uploadedAt: expect.any(Date) }),
    );
    expect(result.state).toBe("UPLOADED");
  });

  it("on a YouTube failure, records a FAILED attempt, moves the job to ERROR with a safe reason, and notifies failure (not upload)", async () => {
    const withTarget = job({
      deliverToYouTube: true,
      snapshot: {
        ...job().snapshot,
        youtubeTarget: {
          id: "target-1",
          name: "Main",
          youtubeChannelId: "UC1",
        },
      },
    });
    findTelegramUserIdForUser.mockResolvedValue("tg-123");
    transitionJob
      .mockResolvedValueOnce(job({ ...withTarget, state: "DELIVERING" }))
      .mockResolvedValueOnce(
        job({
          ...withTarget,
          state: "ERROR",
          errorReason: "The YouTube upload failed.",
        }),
      );
    deliverToYoutube.mockRejectedValue(
      dependencyError("The YouTube upload failed."),
    );

    const result = await deliverJobResult(withTarget);

    expect(completeDeliveryAttempt).toHaveBeenCalledWith("attempt-1", {
      status: "FAILED",
      failureReason: "The YouTube upload failed.",
    });
    expect(transitionJob).toHaveBeenNthCalledWith(
      2,
      "job-1",
      "ERROR",
      expect.objectContaining({ errorReason: "The YouTube upload failed." }),
    );
    expect(result.state).toBe("ERROR");
    // rendered + failed — never a spurious "uploaded successfully" message.
    expect(sendJobNotification).toHaveBeenCalledTimes(2);
    expect(sendJobNotification.mock.calls[1]?.[1]).toContain("failed");
  });

  it("never leaks a raw/internal error message as the failure reason", async () => {
    const withTarget = job({
      deliverToYouTube: true,
      snapshot: {
        ...job().snapshot,
        youtubeTarget: {
          id: "target-1",
          name: "Main",
          youtubeChannelId: "UC1",
        },
      },
    });
    transitionJob
      .mockResolvedValueOnce(job({ ...withTarget, state: "DELIVERING" }))
      .mockResolvedValueOnce(job({ ...withTarget, state: "ERROR" }));
    deliverToYoutube.mockRejectedValue(new Error("ECONNRESET at socket.js:42"));

    await deliverJobResult(withTarget);

    expect(completeDeliveryAttempt).toHaveBeenCalledWith("attempt-1", {
      status: "FAILED",
      failureReason: "The YouTube upload failed unexpectedly.",
    });
  });
});
