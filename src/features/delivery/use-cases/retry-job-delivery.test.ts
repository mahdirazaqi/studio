import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeJobDetail } from "@/features/jobs/domain/job";

const findJobInScope = vi.fn();
const transitionJobRow = vi.fn();
const runYoutubeDelivery = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobInScope: (...args: unknown[]) => findJobInScope(...args),
  transitionJobRow: (...args: unknown[]) => transitionJobRow(...args),
}));

vi.mock("@/features/delivery/use-cases/deliver-job-result", () => ({
  runYoutubeDelivery: (...args: unknown[]) => runYoutubeDelivery(...args),
}));

const { retryJobDelivery } = await import("./retry-job-delivery");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

const job = (overrides: Partial<SafeJobDetail> = {}): SafeJobDetail => ({
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Job title",
  state: "ERROR",
  progress: null,
  durationSeconds: null,
  deliverToYouTube: true,
  retryOfJobId: null,
  attemptNumber: 1,
  createdByUserId: "user-1",
  createdByName: "User One",
  errorReason: "The YouTube upload failed.",
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot: {
    templateId: "template-1",
    templateName: "T",
    composition: "c",
    source: "s",
    scriptRef: "s.js",
    outputPattern: "op",
    description: null,
    tags: [],
    assetSlotDefinitions: [],
    youtubeTarget: { id: "target-1", name: "Main", youtubeChannelId: "UC1" },
  },
  assets: [],
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
  deliveredAt: new Date(),
  uploadedAt: null,
  videoFileId: "file-video",
  screenshotFileId: "file-screenshot",
  thumbnailFileId: "file-thumbnail",
  deliveryAttempts: [
    {
      id: "attempt-1",
      provider: "YOUTUBE",
      status: "FAILED",
      attemptNumber: 1,
      providerRef: null,
      failureReason: "The YouTube upload failed.",
      triggeredByUserId: null,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retryJobDelivery", () => {
  it("throws not_found when out of scope", async () => {
    findJobInScope.mockResolvedValue(null);
    await expect(retryJobDelivery(actor(), "job-1")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("forbids a cross-department USER", async () => {
    findJobInScope.mockResolvedValue(job({ departmentId: "dept-b" }));
    await expect(retryJobDelivery(actor(), "job-1")).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("rejects a job that isn't in ERROR", async () => {
    findJobInScope.mockResolvedValue(job({ state: "UPLOADED" }));
    await expect(retryJobDelivery(actor(), "job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(transitionJobRow).not.toHaveBeenCalled();
  });

  it("rejects a job that was never configured for YouTube delivery", async () => {
    findJobInScope.mockResolvedValue(
      job({
        deliverToYouTube: false,
        snapshot: { ...job().snapshot, youtubeTarget: null },
      }),
    );
    await expect(retryJobDelivery(actor(), "job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
  });

  it("rejects a job whose render itself failed (no video to redeliver)", async () => {
    findJobInScope.mockResolvedValue(job({ videoFileId: null }));
    await expect(retryJobDelivery(actor(), "job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
  });

  it("refuses to retry a delivery that already succeeded", async () => {
    findJobInScope.mockResolvedValue(
      job({
        deliveryAttempts: [
          {
            id: "attempt-1",
            provider: "YOUTUBE",
            status: "SUCCEEDED",
            attemptNumber: 1,
            providerRef: "yt-1",
            failureReason: null,
            triggeredByUserId: null,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
      }),
    );
    await expect(retryJobDelivery(actor(), "job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(transitionJobRow).not.toHaveBeenCalled();
  });

  it("moves ERROR -> DELIVERING and runs YouTube delivery again with the next attempt number", async () => {
    const current = job();
    findJobInScope.mockResolvedValue(current);
    const delivering = job({ state: "DELIVERING" });
    transitionJobRow.mockResolvedValue(delivering);
    runYoutubeDelivery.mockResolvedValue(job({ state: "UPLOADED" }));

    const result = await retryJobDelivery(actor({ role: "MANAGER" }), "job-1");

    expect(transitionJobRow).toHaveBeenCalledWith(
      "job-1",
      ["ERROR"],
      "DELIVERING",
      expect.objectContaining({ deliveredAt: expect.any(Date) }),
    );
    expect(runYoutubeDelivery).toHaveBeenCalledWith(delivering, {
      attemptNumber: 2,
      triggeredByUserId: "user-1",
    });
    expect(result.state).toBe("UPLOADED");
  });

  it("throws conflict if the job's state changed before the retry could start", async () => {
    findJobInScope.mockResolvedValue(job());
    transitionJobRow.mockResolvedValue(null);
    await expect(retryJobDelivery(actor(), "job-1")).rejects.toMatchObject({
      kind: "conflict",
    });
    expect(runYoutubeDelivery).not.toHaveBeenCalled();
  });
});
