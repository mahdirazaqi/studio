import { describe, expect, it } from "vitest";

import { authenticateWorker } from "./index";

// Matches the WORKER_API_KEY stubbed in vitest.config.ts's test env.
const VALID_KEY = "test-worker-api-key-not-a-real-secret";

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("http://localhost/api/worker/v1/jobs/next", { headers });
}

function unauthenticated() {
  return expect.objectContaining({ kind: "unauthenticated" });
}

describe("authenticateWorker", () => {
  it("accepts a correct Bearer token", () => {
    expect(() =>
      authenticateWorker(requestWithAuth(`Bearer ${VALID_KEY}`)),
    ).not.toThrow();
  });

  it("rejects a missing Authorization header", () => {
    expect(() => authenticateWorker(requestWithAuth(null))).toThrow(
      unauthenticated(),
    );
  });

  it("rejects an incorrect key", () => {
    expect(() =>
      authenticateWorker(requestWithAuth("Bearer wrong-key")),
    ).toThrow(unauthenticated());
  });

  it("rejects a header missing the Bearer prefix", () => {
    expect(() => authenticateWorker(requestWithAuth(VALID_KEY))).toThrow(
      unauthenticated(),
    );
  });

  it("rejects an empty Bearer token", () => {
    expect(() => authenticateWorker(requestWithAuth("Bearer "))).toThrow(
      unauthenticated(),
    );
  });

  it("rejects a token that is a different length than the real key", () => {
    expect(() => authenticateWorker(requestWithAuth("Bearer short"))).toThrow(
      unauthenticated(),
    );
  });

  it("rejects a token that shares a long common prefix with the real key", () => {
    const almostRight = VALID_KEY.slice(0, -1) + "X";
    expect(() =>
      authenticateWorker(requestWithAuth(`Bearer ${almostRight}`)),
    ).toThrow(unauthenticated());
  });

  it("never includes the submitted token in the thrown error", () => {
    try {
      authenticateWorker(requestWithAuth("Bearer some-guessed-secret-value"));
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(
        "some-guessed-secret-value",
      );
    }
  });
});
