import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    workerApiKey: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

const {
  authenticateWorker,
  authenticateWorkerLenient,
  assertWorkerDepartmentAccess,
  hashWorkerApiKeySecret,
} = await import("./index");

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("http://localhost/api/v1/worker/jobs/next", { headers });
}

function unauthenticated() {
  return expect.objectContaining({ kind: "unauthenticated" });
}

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue(undefined);
});

describe("authenticateWorker", () => {
  it("accepts a valid, active Bearer token and resolves its Department scope", async () => {
    findUnique.mockResolvedValue({
      id: "key-1",
      status: "ACTIVE",
      departments: [{ id: "dept-a" }, { id: "dept-b" }],
    });
    const result = await authenticateWorker(
      requestWithAuth("Bearer real-secret"),
    );
    expect(result).toEqual({
      workerApiKeyId: "key-1",
      allowedDepartmentIds: ["dept-a", "dept-b"],
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashWorkerApiKeySecret("real-secret") },
      select: { id: true, status: true, departments: { select: { id: true } } },
    });
  });

  it("records a best-effort lastUsedAt update without blocking the result", async () => {
    findUnique.mockResolvedValue({
      id: "key-1",
      status: "ACTIVE",
      departments: [],
    });
    await authenticateWorker(requestWithAuth("Bearer real-secret"));
    expect(update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("rejects a missing Authorization header", async () => {
    await expect(
      authenticateWorker(requestWithAuth(null)),
    ).rejects.toMatchObject(unauthenticated());
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("rejects a header missing the Bearer prefix", async () => {
    await expect(
      authenticateWorker(requestWithAuth("real-secret")),
    ).rejects.toMatchObject(unauthenticated());
  });

  it("rejects an empty Bearer token", async () => {
    await expect(
      authenticateWorker(requestWithAuth("Bearer ")),
    ).rejects.toMatchObject(unauthenticated());
  });

  it("rejects an unknown key (no matching hash)", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      authenticateWorker(requestWithAuth("Bearer nonexistent")),
    ).rejects.toMatchObject(unauthenticated());
  });

  it("rejects a REVOKED key even if the hash matches", async () => {
    findUnique.mockResolvedValue({
      id: "key-1",
      status: "REVOKED",
      departments: [],
    });
    await expect(
      authenticateWorker(requestWithAuth("Bearer revoked-secret")),
    ).rejects.toMatchObject(unauthenticated());
    expect(update).not.toHaveBeenCalled();
  });

  it("never includes the submitted token in the thrown error", async () => {
    findUnique.mockResolvedValue(null);
    try {
      await authenticateWorker(
        requestWithAuth("Bearer some-guessed-secret-value"),
      );
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(
        "some-guessed-secret-value",
      );
    }
  });
});

// ADR-0043 — the actual Worker's upload/download calls send no
// Authorization header at all, unlike fetch/state/progress/duration.
describe("authenticateWorkerLenient", () => {
  it("returns null for a request with no Authorization header at all", async () => {
    const result = await authenticateWorkerLenient(requestWithAuth(null));
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("authenticates strictly, exactly like authenticateWorker, when a header IS present", async () => {
    findUnique.mockResolvedValue({
      id: "key-1",
      status: "ACTIVE",
      departments: [{ id: "dept-a" }],
    });
    const result = await authenticateWorkerLenient(
      requestWithAuth("Bearer real-secret"),
    );
    expect(result).toEqual({
      workerApiKeyId: "key-1",
      allowedDepartmentIds: ["dept-a"],
    });
  });

  it("still rejects a present-but-invalid header — never silently downgrades a failed auth attempt to null", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      authenticateWorkerLenient(requestWithAuth("Bearer nonexistent")),
    ).rejects.toMatchObject(unauthenticated());
  });
});

describe("assertWorkerDepartmentAccess", () => {
  it("allows a Job in one of the Worker's allowed Departments", () => {
    expect(() =>
      assertWorkerDepartmentAccess(["dept-a", "dept-c"], "dept-a"),
    ).not.toThrow();
  });

  it("rejects a Job outside scope as not_found (never forbidden — no existence leak)", () => {
    expect(() =>
      assertWorkerDepartmentAccess(["dept-a", "dept-c"], "dept-b"),
    ).toThrow(expect.objectContaining({ kind: "not_found" }));
  });

  it("rejects every Job for a key with an empty Department scope", () => {
    expect(() => assertWorkerDepartmentAccess([], "dept-a")).toThrow(
      expect.objectContaining({ kind: "not_found" }),
    );
  });
});
