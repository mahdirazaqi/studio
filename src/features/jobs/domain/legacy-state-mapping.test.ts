import { describe, expect, it } from "vitest";

import {
  legacyStateInt,
  mapWorkerState,
} from "@/features/jobs/domain/legacy-state-mapping";
import { JOB_STATES } from "@/features/jobs/domain/job";

describe("mapWorkerState", () => {
  it.each([
    [0, "QUEUED"],
    [1, "CLAIMED"],
    [2, "RENDERING"],
    [3, "RENDERING"],
    [4, "RENDERING"],
    [5, "RENDERED"],
    [8, "ERROR"],
    [9, "CANCELED"],
  ] as const)("maps legacy int %i to %s", (input, expected) => {
    expect(mapWorkerState(input)).toBe(expected);
  });

  it("rejects an out-of-range integer", () => {
    expect(mapWorkerState(10)).toBeNull();
    expect(mapWorkerState(-1)).toBeNull();
  });

  it("rejects the removed YouTube-upload legacy codes (6 Uploading, 7 Uploaded)", () => {
    expect(mapWorkerState(6)).toBeNull();
    expect(mapWorkerState(7)).toBeNull();
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

// ADR-0043 — backs the unauthenticated legacy cancel-status poll, whose
// only real consumer (`CanCancel` in the actual Worker) checks `state == 9`
// exclusively.
describe("legacyStateInt", () => {
  it("maps CANCELED to exactly 9 — the one value the real Worker's CanCancel checks for", () => {
    expect(legacyStateInt("CANCELED")).toBe(9);
  });

  it("returns a defined integer for every declared Studio state", () => {
    for (const state of JOB_STATES) {
      expect(Number.isInteger(legacyStateInt(state))).toBe(true);
    }
  });

  it("never returns 9 for a non-CANCELED state (would falsely signal cancellation to the Worker)", () => {
    for (const state of JOB_STATES) {
      if (state === "CANCELED") continue;
      expect(legacyStateInt(state)).not.toBe(9);
    }
  });

  it("round-trips through mapWorkerState for every non-legacy-ambiguous state", () => {
    for (const state of JOB_STATES) {
      expect(mapWorkerState(legacyStateInt(state))).toBe(state);
    }
  });
});
