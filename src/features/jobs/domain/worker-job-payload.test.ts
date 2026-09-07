import { describe, expect, it } from "vitest";

import { buildWorkerJobPayload } from "@/features/jobs/domain/worker-job-payload";
import type { SafeJobDetail } from "@/features/jobs/domain/job";

const baseJob: SafeJobDetail = {
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Hello World",
  state: "QUEUED",
  progress: null,
  durationSeconds: null,
  retryOfJobId: null,
  attemptNumber: 1,
  createdByUserId: "u1",
  createdByName: "User One",
  errorReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot: {
    templateId: "template-1",
    templateName: "T",
    composition: "main-comp",
    source: "src://project",
    scriptRef: "script.js",
    outputPattern: "out/%s.mp4",
    assetSlotDefinitions: [],
  },
  assets: [
    {
      id: "ja-0",
      slotKey: null,
      kind: "SCRIPT",
      composition: null,
      layer: null,
      textValue: "script.js",
      fileId: null,
      fileOriginalName: null,
      fileMimeType: null,
      fileSizeBytes: null,
      fileWidth: null,
      fileHeight: null,
      order: 0,
    },
    {
      id: "ja-1",
      slotKey: "caption",
      kind: "DATA",
      composition: "c1",
      layer: "l1",
      textValue: "Hello World",
      fileId: null,
      fileOriginalName: null,
      fileMimeType: null,
      fileSizeBytes: null,
      fileWidth: null,
      fileHeight: null,
      order: 1,
    },
    {
      id: "ja-2",
      slotKey: "cover",
      kind: "IMAGE",
      composition: "c2",
      layer: "l2",
      textValue: null,
      fileId: "file-1",
      fileOriginalName: "cover.png",
      fileMimeType: "image/png",
      fileSizeBytes: 100,
      fileWidth: 10,
      fileHeight: 10,
      order: 2,
    },
  ],
  retriedByUserId: null,
  retriedByName: null,
  retryReason: null,
  canceledByUserId: null,
  canceledByName: null,
  canceledAt: null,
  claimedAt: null,
  cancelReason: null,
  startedAt: null,
  renderedAt: null,
  videoFileId: null,
  screenshotFileId: null,
  thumbnailFileId: null,
};

const buildFileUrl = (fileId: string) =>
  `https://studio.example/api/files/${fileId}`;

describe("buildWorkerJobPayload", () => {
  it("keeps legacy field names at the top level, plus a new state field", () => {
    const payload = buildWorkerJobPayload(baseJob, buildFileUrl);
    expect(payload).toMatchObject({
      id: "job-1",
      state: "QUEUED",
      output: "out/%s.mp4",
      title: "Hello World",
      composition: "main-comp",
      template: "src://project",
    });
  });

  it("maps the SCRIPT asset's value into src, not text", () => {
    const payload = buildWorkerJobPayload(baseJob, buildFileUrl);
    expect(payload.assets[0]).toMatchObject({
      type: "script",
      src: "script.js",
      text: null,
    });
  });

  it("maps a DATA asset's value into text, not src", () => {
    const payload = buildWorkerJobPayload(baseJob, buildFileUrl);
    expect(payload.assets[1]).toMatchObject({
      type: "data",
      text: "Hello World",
      src: null,
    });
  });

  it("maps a file-kind asset's src to a Worker-fetchable URL", () => {
    const payload = buildWorkerJobPayload(baseJob, buildFileUrl);
    expect(payload.assets[2]).toMatchObject({
      type: "image",
      src: "https://studio.example/api/files/file-1",
      text: null,
    });
  });

  it("returns a null src for a file-kind asset whose File was deleted", () => {
    const jobWithDeletedFile: SafeJobDetail = {
      ...baseJob,
      assets: [
        {
          ...baseJob.assets[2]!,
          fileId: null,
        },
      ],
    };
    const payload = buildWorkerJobPayload(jobWithDeletedFile, buildFileUrl);
    expect(payload.assets[0]?.src).toBeNull();
  });

  it("never leaks unrelated internal fields (creator name, department, etc.)", () => {
    const payload = buildWorkerJobPayload(baseJob, buildFileUrl);
    expect(payload).not.toHaveProperty("createdByName");
    expect(payload).not.toHaveProperty("departmentId");
    expect(payload).not.toHaveProperty("canceledByName");
  });
});
