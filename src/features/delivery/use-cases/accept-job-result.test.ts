import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SafeJobDetail } from "@/features/jobs/domain/job";

const findJobById = vi.fn();
const transitionJobRow = vi.fn();
const generateRenderArtifacts = vi.fn();
const rollbackRenderArtifacts = vi.fn();
const deliverJobResult = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobById: (...args: unknown[]) => findJobById(...args),
  transitionJobRow: (...args: unknown[]) => transitionJobRow(...args),
}));

vi.mock("@/features/delivery/use-cases/generate-render-artifacts", () => ({
  generateRenderArtifacts: (...args: unknown[]) =>
    generateRenderArtifacts(...args),
  rollbackRenderArtifacts: (...args: unknown[]) =>
    rollbackRenderArtifacts(...args),
}));

vi.mock("@/features/delivery/use-cases/deliver-job-result", () => ({
  deliverJobResult: (...args: unknown[]) => deliverJobResult(...args),
}));

const { acceptJobResult } = await import("./accept-job-result");

const job = (overrides: Partial<SafeJobDetail> = {}): SafeJobDetail => ({
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Job title",
  state: "RENDERING",
  progress: null,
  durationSeconds: null,
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
  renderedAt: null,
  deliveredAt: null,
  uploadedAt: null,
  videoFileId: null,
  screenshotFileId: null,
  thumbnailFileId: null,
  deliveryAttempts: [],
  ...overrides,
});

const artifacts = {
  video: { id: "file-video" },
  screenshot: { id: "file-screenshot" },
  thumbnail: { id: "file-thumbnail" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptJobResult", () => {
  it("throws not_found for an unknown job", async () => {
    findJobById.mockResolvedValue(null);
    await expect(
      acceptJobResult("job-1", Buffer.from("x")),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("rejects a job that isn't RENDERING and has no prior result", async () => {
    findJobById.mockResolvedValue(job({ state: "QUEUED" }));
    await expect(
      acceptJobResult("job-1", Buffer.from("x")),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
  });

  it("is idempotent for a duplicate Worker request — returns the existing result without reprocessing", async () => {
    const alreadyDone = job({ state: "UPLOADED", videoFileId: "file-video" });
    findJobById.mockResolvedValue(alreadyDone);
    const result = await acceptJobResult("job-1", Buffer.from("x"));
    expect(result).toBe(alreadyDone);
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
    expect(transitionJobRow).not.toHaveBeenCalled();
    expect(deliverJobResult).not.toHaveBeenCalled();
  });

  it("rejects an empty result body", async () => {
    findJobById.mockResolvedValue(job({ state: "RENDERING" }));
    await expect(
      acceptJobResult("job-1", Buffer.alloc(0)),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
  });

  it("rejects a result body larger than the video size limit", async () => {
    findJobById.mockResolvedValue(job({ state: "RENDERING" }));
    const huge = Buffer.alloc(600 * 1024 * 1024); // over the 500MB VIDEO rule
    await expect(acceptJobResult("job-1", huge)).rejects.toMatchObject({
      kind: "validation",
    });
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
  });

  it("accepts a valid result: generates artifacts, transitions to RENDERED, and runs delivery", async () => {
    const rendering = job({ state: "RENDERING" });
    const rendered = job({
      state: "RENDERED",
      videoFileId: "file-video",
      screenshotFileId: "file-screenshot",
      thumbnailFileId: "file-thumbnail",
    });
    findJobById.mockResolvedValue(rendering);
    generateRenderArtifacts.mockResolvedValue(artifacts);
    transitionJobRow.mockResolvedValue(rendered);
    deliverJobResult.mockResolvedValue({ ...rendered, state: "UPLOADED" });

    const result = await acceptJobResult("job-1", Buffer.from("video bytes"));

    expect(generateRenderArtifacts).toHaveBeenCalledWith(
      "dept-a",
      expect.any(Buffer),
    );
    expect(transitionJobRow).toHaveBeenCalledWith(
      "job-1",
      ["RENDERING"],
      "RENDERED",
      expect.objectContaining({
        videoFileId: "file-video",
        screenshotFileId: "file-screenshot",
        thumbnailFileId: "file-thumbnail",
      }),
    );
    expect(deliverJobResult).toHaveBeenCalledWith(rendered);
    expect(result.state).toBe("UPLOADED");
  });

  it("on a lost RENDERING->RENDERED race, rolls back its own artifacts and returns the winner's result idempotently", async () => {
    findJobById
      .mockResolvedValueOnce(job({ state: "RENDERING" }))
      .mockResolvedValueOnce(
        job({ state: "RENDERED", videoFileId: "file-video-winner" }),
      );
    generateRenderArtifacts.mockResolvedValue(artifacts);
    transitionJobRow.mockResolvedValue(null); // lost the race

    const result = await acceptJobResult("job-1", Buffer.from("video bytes"));

    expect(rollbackRenderArtifacts).toHaveBeenCalledWith(artifacts);
    expect(result.videoFileId).toBe("file-video-winner");
    expect(deliverJobResult).not.toHaveBeenCalled();
  });

  it("throws conflict when the race is lost and no winner's result is visible either", async () => {
    findJobById
      .mockResolvedValueOnce(job({ state: "RENDERING" }))
      .mockResolvedValueOnce(job({ state: "CANCELED", videoFileId: null }));
    generateRenderArtifacts.mockResolvedValue(artifacts);
    transitionJobRow.mockResolvedValue(null);

    await expect(
      acceptJobResult("job-1", Buffer.from("video bytes")),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(rollbackRenderArtifacts).toHaveBeenCalledWith(artifacts);
  });
});
