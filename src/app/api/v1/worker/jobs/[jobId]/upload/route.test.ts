import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateWorker = vi.fn();
const acceptJobResult = vi.fn();

vi.mock("@/server/worker-auth", () => ({
  // authenticateWorkerLenient re-implemented inline against the mocked
  // authenticateWorker, mirroring the real module's own logic, so this test
  // exercises the route's actual behavior for both branches.
  authenticateWorkerLenient: async (request: Request) => {
    if (!request.headers.get("authorization")) return null;
    return authenticateWorker(request);
  },
}));

vi.mock("@/features/delivery/use-cases/accept-job-result", () => ({
  acceptJobResult: (...args: unknown[]) => acceptJobResult(...args),
}));

const { POST } = await import("./route");

function multipartRequest(
  fileBytes: Uint8Array,
  filename = "result.mp4",
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  form.set(
    "file",
    new Blob([fileBytes.buffer as ArrayBuffer], { type: "video/mp4" }),
    filename,
  );
  return new Request(
    "http://localhost/api/v1/worker/jobs/job-1/upload",
    { method: "POST", body: form, headers },
  );
}

function routeCtx(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Mirrors the actual Worker's real request
 * (`navaak-ae-renderer/renderer/operator/upload.go`'s `UploadJob`):
 * multipart/form-data, field name "file", filename always "result.mp4", no
 * Authorization header (ADR-0043).
 */
describe("POST /api/v1/worker/jobs/:id/upload", () => {
  it("accepts the Worker's real multipart shape (field 'file') with no Authorization header", async () => {
    acceptJobResult.mockResolvedValue({
      id: "job-1",
      state: "RENDERED",
      videoFileId: "file-video",
    });

    const response = await POST(
      multipartRequest(new Uint8Array([1, 2, 3, 4])),
      routeCtx("job-1"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      id: "job-1",
      state: "RENDERED",
      videoFileId: "file-video",
    });
    expect(acceptJobResult).toHaveBeenCalledWith(
      "job-1",
      expect.any(Buffer),
      null, // no credential presented — matches the real Worker's call
    );
    expect(authenticateWorker).not.toHaveBeenCalled();
  });

  it("authenticates and scopes when an Authorization header IS present", async () => {
    authenticateWorker.mockResolvedValue({
      workerApiKeyId: "key-1",
      allowedDepartmentIds: ["dept-a"],
    });
    acceptJobResult.mockResolvedValue({
      id: "job-1",
      state: "RENDERED",
      videoFileId: "file-video",
    });

    await POST(
      multipartRequest(new Uint8Array([1, 2, 3]), "result.mp4", {
        authorization: "Bearer real-secret",
      }),
      routeCtx("job-1"),
    );

    expect(acceptJobResult).toHaveBeenCalledWith(
      "job-1",
      expect.any(Buffer),
      ["dept-a"],
    );
  });

  it("rejects a request with no 'file' field", async () => {
    const form = new FormData();
    form.set("notfile", "oops");
    const response = await POST(
      new Request("http://localhost/api/v1/worker/jobs/job-1/upload", {
        method: "POST",
        body: form,
      }),
      routeCtx("job-1"),
    );
    expect(response.status).toBe(422);
    expect(acceptJobResult).not.toHaveBeenCalled();
  });
});
