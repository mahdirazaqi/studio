import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SafeJobDetail } from "@/features/jobs/domain/job";

const findJobById = vi.fn();
const transitionJobRow = vi.fn();
const generateRenderArtifacts = vi.fn();
const rollbackRenderArtifacts = vi.fn();
const sendJobNotification = vi.fn();
const findTelegramUserIdForUser = vi.fn();

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

vi.mock(
  "@/features/delivery/infrastructure/telegram/telegram-delivery-adapter",
  () => ({
    sendJobNotification: (...args: unknown[]) => sendJobNotification(...args),
  }),
);

vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  findTelegramUserIdForUser: (...args: unknown[]) =>
    findTelegramUserIdForUser(...args),
}));

const { acceptJobResult } = await import("./accept-job-result");

const ALLOWED = ["dept-a"];

const job = (overrides: Partial<SafeJobDetail> = {}): SafeJobDetail => ({
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Job title",
  state: "RENDERING",
  progress: null,
  durationSeconds: null,
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
    assetSlotDefinitions: [],
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
  videoFileId: null,
  screenshotFileId: null,
  thumbnailFileId: null,
  ...overrides,
});

const artifacts = {
  video: { id: "file-video" },
  screenshot: { id: "file-screenshot" },
  thumbnail: { id: "file-thumbnail" },
};

beforeEach(() => {
  vi.clearAllMocks();
  findTelegramUserIdForUser.mockResolvedValue(null);
});

describe("acceptJobResult", () => {
  it("throws not_found for an unknown job", async () => {
    findJobById.mockResolvedValue(null);
    await expect(
      acceptJobResult("job-1", Buffer.from("x"), ALLOWED),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("rejects a job that isn't RENDERING and has no prior result", async () => {
    findJobById.mockResolvedValue(job({ state: "QUEUED" }));
    await expect(
      acceptJobResult("job-1", Buffer.from("x"), ALLOWED),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
  });

  it("is idempotent for a duplicate Worker request — returns the existing result without reprocessing", async () => {
    const alreadyDone = job({ state: "RENDERED", videoFileId: "file-video" });
    findJobById.mockResolvedValue(alreadyDone);
    const result = await acceptJobResult("job-1", Buffer.from("x"), ALLOWED);
    expect(result).toBe(alreadyDone);
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
    expect(transitionJobRow).not.toHaveBeenCalled();
    expect(sendJobNotification).not.toHaveBeenCalled();
  });

  it("rejects an empty result body", async () => {
    findJobById.mockResolvedValue(job({ state: "RENDERING" }));
    await expect(
      acceptJobResult("job-1", Buffer.alloc(0), ALLOWED),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
  });

  it("rejects a result body larger than the video size limit", async () => {
    findJobById.mockResolvedValue(job({ state: "RENDERING" }));
    const huge = Buffer.alloc(600 * 1024 * 1024); // over the 500MB VIDEO rule
    await expect(acceptJobResult("job-1", huge, ALLOWED)).rejects.toMatchObject(
      {
        kind: "validation",
      },
    );
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
  });

  it("accepts a valid result: generates artifacts, transitions to RENDERED (the Job's final state), and never calls any external delivery", async () => {
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

    const result = await acceptJobResult(
      "job-1",
      Buffer.from("video bytes"),
      ALLOWED,
    );

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
    expect(result.state).toBe("RENDERED");
    expect(result).toBe(rendered);
  });

  it("sends a best-effort 'rendered' Telegram notification when the creator is linked", async () => {
    const rendering = job({ state: "RENDERING" });
    const rendered = job({ state: "RENDERED", videoFileId: "file-video" });
    findJobById.mockResolvedValue(rendering);
    generateRenderArtifacts.mockResolvedValue(artifacts);
    transitionJobRow.mockResolvedValue(rendered);
    findTelegramUserIdForUser.mockResolvedValue("tg-1");

    await acceptJobResult("job-1", Buffer.from("video bytes"), ALLOWED);

    expect(sendJobNotification).toHaveBeenCalledWith(
      "tg-1",
      expect.stringContaining("rendered successfully"),
    );
  });

  it("skips the notification silently when the creator has no linked Telegram account", async () => {
    const rendering = job({ state: "RENDERING" });
    const rendered = job({ state: "RENDERED", videoFileId: "file-video" });
    findJobById.mockResolvedValue(rendering);
    generateRenderArtifacts.mockResolvedValue(artifacts);
    transitionJobRow.mockResolvedValue(rendered);
    findTelegramUserIdForUser.mockResolvedValue(null);

    await acceptJobResult("job-1", Buffer.from("video bytes"), ALLOWED);

    expect(sendJobNotification).not.toHaveBeenCalled();
  });

  it("on a lost RENDERING->RENDERED race, rolls back its own artifacts and returns the winner's result idempotently", async () => {
    findJobById
      .mockResolvedValueOnce(job({ state: "RENDERING" }))
      .mockResolvedValueOnce(
        job({ state: "RENDERED", videoFileId: "file-video-winner" }),
      );
    generateRenderArtifacts.mockResolvedValue(artifacts);
    transitionJobRow.mockResolvedValue(null); // lost the race

    const result = await acceptJobResult(
      "job-1",
      Buffer.from("video bytes"),
      ALLOWED,
    );

    expect(rollbackRenderArtifacts).toHaveBeenCalledWith(artifacts);
    expect(result.videoFileId).toBe("file-video-winner");
    expect(sendJobNotification).not.toHaveBeenCalled();
  });

  it("throws conflict when the race is lost and no winner's result is visible either", async () => {
    findJobById
      .mockResolvedValueOnce(job({ state: "RENDERING" }))
      .mockResolvedValueOnce(job({ state: "CANCELED", videoFileId: null }));
    generateRenderArtifacts.mockResolvedValue(artifacts);
    transitionJobRow.mockResolvedValue(null);

    await expect(
      acceptJobResult("job-1", Buffer.from("video bytes"), ALLOWED),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(rollbackRenderArtifacts).toHaveBeenCalledWith(artifacts);
  });

  it("throws not_found (never forbidden) for a job outside the Worker's allowed departments", async () => {
    findJobById.mockResolvedValue(
      job({ state: "RENDERING", departmentId: "dept-z" }),
    );
    await expect(
      acceptJobResult("job-1", Buffer.from("video bytes"), ALLOWED),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(generateRenderArtifacts).not.toHaveBeenCalled();
  });

  // ADR-0043 — the actual Worker's upload call sends no Authorization
  // header, and calls `ChangeState(Rendered)` before uploading.
  describe("Worker-compatibility broadening (ADR-0043)", () => {
    it("accepts a job already RENDERED with no videoFileId yet (the Worker's real call order)", async () => {
      const alreadyRendered = job({ state: "RENDERED", videoFileId: null });
      const rendered = job({
        state: "RENDERED",
        videoFileId: "file-video",
        screenshotFileId: "file-screenshot",
        thumbnailFileId: "file-thumbnail",
      });
      findJobById.mockResolvedValue(alreadyRendered);
      generateRenderArtifacts.mockResolvedValue(artifacts);
      transitionJobRow.mockResolvedValue(rendered);

      const result = await acceptJobResult(
        "job-1",
        Buffer.from("video bytes"),
        ALLOWED,
      );

      expect(transitionJobRow).toHaveBeenCalledWith(
        "job-1",
        ["RENDERED"],
        "RENDERED",
        expect.objectContaining({ videoFileId: "file-video" }),
      );
      expect(result.videoFileId).toBe("file-video");
    });

    it("accepts with allowedDepartmentIds: null (no Worker credential presented) without any Department check", async () => {
      const rendering = job({ state: "RENDERING" });
      const rendered = job({ state: "RENDERED", videoFileId: "file-video" });
      findJobById.mockResolvedValue(rendering);
      generateRenderArtifacts.mockResolvedValue(artifacts);
      transitionJobRow.mockResolvedValue(rendered);

      const result = await acceptJobResult(
        "job-1",
        Buffer.from("video bytes"),
        null,
      );

      expect(result.state).toBe("RENDERED");
    });

    it("still rejects a job in a genuinely wrong state (e.g. QUEUED) even with null credentials", async () => {
      findJobById.mockResolvedValue(job({ state: "QUEUED" }));
      await expect(
        acceptJobResult("job-1", Buffer.from("x"), null),
      ).rejects.toMatchObject({ kind: "business_rule" });
      expect(generateRenderArtifacts).not.toHaveBeenCalled();
    });
  });
});
