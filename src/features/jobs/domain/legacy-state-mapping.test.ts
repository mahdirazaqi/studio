import { describe, expect, it } from "vitest";

import { mapWorkerState } from "@/features/jobs/domain/legacy-state-mapping";

describe("mapWorkerState", () => {
  it.each([
    [0, "QUEUED"],
    [1, "CLAIMED"],
    [2, "RENDERING"],
    [3, "RENDERING"],
    [4, "RENDERING"],
    [5, "RENDERED"],
    [6, "DELIVERING"],
    [7, "UPLOADED"],
    [8, "ERROR"],
    [9, "CANCELED"],
  ] as const)("maps legacy int %i to %s", (input, expected) => {
    expect(mapWorkerState(input)).toBe(expected);
  });

  it("rejects an out-of-range integer", () => {
    expect(mapWorkerState(10)).toBeNull();
    expect(mapWorkerState(-1)).toBeNull();
  });

  it("accepts a canonical Studio name", () => {
    expect(mapWorkerState("RENDERING")).toBe("RENDERING");
  });

  it("accepts a canonical Studio name case-insensitively", () => {
    expect(mapWorkerState("rendering")).toBe("RENDERING");
  });

  it("rejects an unknown string", () => {
    expect(mapWorkerState("Downloading")).toBeNull();
    expect(mapWorkerState("")).toBeNull();
  });
});
