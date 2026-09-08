import { beforeEach, describe, expect, it, vi } from "vitest";

const getJobLegacyCancelStatus = vi.fn();

vi.mock("@/features/jobs/use-cases/get-job-legacy-cancel-status", () => ({
  getJobLegacyCancelStatus: (...args: unknown[]) =>
    getJobLegacyCancelStatus(...args),
}));

const { GET } = await import("./route");

function routeCtx(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The legacy shape the actual Worker's `CanCancel`
 * (`navaak-ae-renderer/worker/worker.go`) unmarshals: `{"job":{"_id":...,
 * "state":...}}` on success, `{"statusCode":404}` on a missing Job — not
 * Studio's usual `{error:{...}}` envelope.
 */
describe("GET /api/internal/legacy-job-status/:jobId", () => {
  it("returns the legacy {job:{_id,state}} shape for an existing job", async () => {
    getJobLegacyCancelStatus.mockResolvedValue({ id: "job-1", state: 9 });
    const response = await GET(
      new Request("http://localhost/api/internal/legacy-job-status/job-1"),
      routeCtx("job-1"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      job: { _id: "job-1", state: 9 },
    });
  });

  it("returns {statusCode:404} for an unknown job", async () => {
    getJobLegacyCancelStatus.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/internal/legacy-job-status/nope"),
      routeCtx("nope"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ statusCode: 404 });
  });

  it("returns {statusCode:404} for a malformed id rather than erroring", async () => {
    const response = await GET(
      new Request("http://localhost/api/internal/legacy-job-status/"),
      routeCtx(""),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ statusCode: 404 });
    expect(getJobLegacyCancelStatus).not.toHaveBeenCalled();
  });
});
