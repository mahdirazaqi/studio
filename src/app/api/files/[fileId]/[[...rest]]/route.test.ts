import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const authenticateWorker = vi.fn();
const getFileForServing = vi.fn();
const getFileForWorkerServing = vi.fn();
const getFileForUnauthenticatedWorkerDownload = vi.fn();
const readStream = vi.fn();

vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));
vi.mock("@/server/authz", () => ({
  toActor: (user: unknown) => user,
}));
vi.mock("@/server/worker-auth", () => ({
  authenticateWorker: (...args: unknown[]) => authenticateWorker(...args),
}));
vi.mock("@/server/adapters/storage", () => ({
  storage: { readStream: (...args: unknown[]) => readStream(...args) },
}));
vi.mock("@/features/files/use-cases/get-file-for-serving", () => ({
  getFileForServing: (...args: unknown[]) => getFileForServing(...args),
}));
vi.mock("@/features/files/use-cases/get-file-for-worker-serving", () => ({
  getFileForWorkerServing: (...args: unknown[]) =>
    getFileForWorkerServing(...args),
}));
vi.mock(
  "@/features/files/use-cases/get-file-for-unauthenticated-worker-download",
  () => ({
    getFileForUnauthenticatedWorkerDownload: (...args: unknown[]) =>
      getFileForUnauthenticatedWorkerDownload(...args),
  }),
);

const { GET } = await import("./route");

const FILE = {
  storageKey: "dept-a/x.png",
  mimeType: "image/png",
  sizeBytes: 4,
  originalName: "cover.png",
};

function routeCtx(fileId: string, rest?: string[]) {
  return { params: Promise.resolve({ fileId, rest }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  readStream.mockReturnValue(Readable.from([Buffer.from("abcd")]));
});

/**
 * ADR-0044 — the trailing `[[...rest]]` segment exists only so the real
 * Worker's downloader (which names its local copy after the URL's last
 * path segment) gets a real file extension; it must never affect which
 * File is resolved.
 */
describe("GET /api/files/[fileId]/[[...rest]] — filename-hint segment is ignored for lookup", () => {
  it("resolves by fileId alone with no trailing segment (every existing caller)", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "USER" });
    getFileForServing.mockResolvedValue(FILE);

    const response = await GET(
      new Request("http://localhost/api/files/file-1"),
      routeCtx("file-1"),
    );

    expect(response.status).toBe(200);
    expect(getFileForServing).toHaveBeenCalledWith(
      expect.anything(),
      "file-1",
    );
  });

  it("resolves the same File when a filename-hint segment is present", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", role: "USER" });
    getFileForServing.mockResolvedValue(FILE);

    const response = await GET(
      new Request("http://localhost/api/files/file-1/cover.png"),
      routeCtx("file-1", ["cover.png"]),
    );

    expect(response.status).toBe(200);
    expect(getFileForServing).toHaveBeenCalledWith(
      expect.anything(),
      "file-1",
    );
  });

  it("also ignores the segment on the Worker-authenticated path", async () => {
    authenticateWorker.mockResolvedValue({
      workerApiKeyId: "key-1",
      allowedDepartmentIds: ["dept-a"],
    });
    getFileForWorkerServing.mockResolvedValue(FILE);

    const response = await GET(
      new Request("http://localhost/api/files/file-1/cover.png", {
        headers: { authorization: "Bearer secret" },
      }),
      routeCtx("file-1", ["cover.png"]),
    );

    expect(response.status).toBe(200);
    expect(getFileForWorkerServing).toHaveBeenCalledWith("file-1");
  });

  it("also ignores the segment on the credential-less Worker fallback (ADR-0043)", async () => {
    getCurrentUser.mockResolvedValue(null);
    getFileForUnauthenticatedWorkerDownload.mockResolvedValue(FILE);

    const response = await GET(
      new Request("http://localhost/api/files/file-1/cover.png"),
      routeCtx("file-1", ["cover.png"]),
    );

    expect(response.status).toBe(200);
    expect(getFileForUnauthenticatedWorkerDownload).toHaveBeenCalledWith(
      "file-1",
    );
  });
});
