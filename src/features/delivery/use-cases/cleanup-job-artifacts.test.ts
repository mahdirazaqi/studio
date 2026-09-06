import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SafeJobDetail } from "@/features/jobs/domain/job";

const findJobById = vi.fn();
const clearJobVideoFileId = vi.fn();
const deleteFileRow = vi.fn();
const findStorageKey = vi.fn();
const storageDelete = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobById: (...args: unknown[]) => findJobById(...args),
  clearJobVideoFileId: (...args: unknown[]) => clearJobVideoFileId(...args),
}));

vi.mock("@/features/files/repository/file-repository", () => ({
  deleteFileRow: (...args: unknown[]) => deleteFileRow(...args),
  findStorageKey: (...args: unknown[]) => findStorageKey(...args),
}));

vi.mock("@/server/adapters/storage", () => ({
  storage: { delete: (...args: unknown[]) => storageDelete(...args) },
}));

const { cleanupJobArtifacts } = await import("./cleanup-job-artifacts");

const job = (overrides: Partial<SafeJobDetail> = {}): SafeJobDetail => ({
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Job title",
  state: "UPLOADED",
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
    description: null,
    tags: [],
    assetSlotDefinitions: [],
    youtubeTarget: null,
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
  uploadedAt: new Date(),
  videoFileId: "file-video",
  screenshotFileId: "file-screenshot",
  thumbnailFileId: "file-thumbnail",
  deliveryAttempts: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findStorageKey.mockResolvedValue("dept-a/video.mp4");
  deleteFileRow.mockResolvedValue(undefined);
  storageDelete.mockResolvedValue(undefined);
});

describe("cleanupJobArtifacts", () => {
  it("throws not_found for an unknown job", async () => {
    findJobById.mockResolvedValue(null);
    await expect(cleanupJobArtifacts("job-1")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("refuses to clean up a job that isn't UPLOADED", async () => {
    findJobById.mockResolvedValue(job({ state: "RENDERED" }));
    await expect(cleanupJobArtifacts("job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(deleteFileRow).not.toHaveBeenCalled();
  });

  it("refuses to clean up when YouTube delivery was required but never recorded a success", async () => {
    findJobById.mockResolvedValue(
      job({ deliverToYouTube: true, deliveryAttempts: [] }),
    );
    await expect(cleanupJobArtifacts("job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(deleteFileRow).not.toHaveBeenCalled();
  });

  it("is idempotent — a job with no videoFileId is a safe no-op", async () => {
    findJobById.mockResolvedValue(job({ videoFileId: null }));
    const result = await cleanupJobArtifacts("job-1");
    expect(result).toEqual({ cleaned: false });
    expect(deleteFileRow).not.toHaveBeenCalled();
    expect(storageDelete).not.toHaveBeenCalled();
  });

  it("deletes the video's row and bytes, and clears the Job's pointer, when eligible", async () => {
    findJobById.mockResolvedValue(job());
    const result = await cleanupJobArtifacts("job-1");
    expect(clearJobVideoFileId).toHaveBeenCalledWith("job-1", "file-video");
    expect(deleteFileRow).toHaveBeenCalledWith("file-video");
    expect(storageDelete).toHaveBeenCalledWith("dept-a/video.mp4");
    expect(result).toEqual({ cleaned: true });
  });

  it("succeeds when YouTube delivery was required and recorded a success", async () => {
    findJobById.mockResolvedValue(
      job({
        deliverToYouTube: true,
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
    const result = await cleanupJobArtifacts("job-1");
    expect(result).toEqual({ cleaned: true });
  });

  it("tolerates a cleanup failure (row already gone) without throwing, and still attempts storage cleanup", async () => {
    findJobById.mockResolvedValue(job());
    deleteFileRow.mockRejectedValue(new Error("row not found"));
    const result = await cleanupJobArtifacts("job-1");
    expect(result).toEqual({ cleaned: true });
    expect(storageDelete).toHaveBeenCalledWith("dept-a/video.mp4");
  });

  it("never throws just because the storage delete fails", async () => {
    findJobById.mockResolvedValue(job());
    storageDelete.mockRejectedValue(new Error("disk error"));
    await expect(cleanupJobArtifacts("job-1")).resolves.toEqual({
      cleaned: true,
    });
  });
});
