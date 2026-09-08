import { beforeEach, describe, expect, it, vi } from "vitest";

const findFileIfActiveJobInput = vi.fn();

vi.mock("@/features/files/repository/file-repository", () => ({
  findFileIfActiveJobInput: (...args: unknown[]) =>
    findFileIfActiveJobInput(...args),
}));

const { getFileForUnauthenticatedWorkerDownload } = await import(
  "./get-file-for-unauthenticated-worker-download"
);

beforeEach(() => {
  vi.clearAllMocks();
});

// ADR-0043 — the credential-less fallback `/api/files/[fileId]` uses for
// the actual Worker's headerless asset/template downloads.
describe("getFileForUnauthenticatedWorkerDownload", () => {
  it("returns the file when it is a genuine active-Job input", async () => {
    const file = {
      storageKey: "dept-a/x.png",
      mimeType: "image/png",
      sizeBytes: 100,
      originalName: "x.png",
    };
    findFileIfActiveJobInput.mockResolvedValue(file);
    await expect(
      getFileForUnauthenticatedWorkerDownload("file-1"),
    ).resolves.toBe(file);
  });

  it("throws not_found for a file that isn't an active-Job input (never leaks existence)", async () => {
    findFileIfActiveJobInput.mockResolvedValue(null);
    await expect(
      getFileForUnauthenticatedWorkerDownload("file-1"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});
