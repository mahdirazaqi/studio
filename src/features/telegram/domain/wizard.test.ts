import { describe, expect, it } from "vitest";

import { advanceTrackCursor, describeSlotKind } from "./wizard";

describe("describeSlotKind", () => {
  it("describes every slot kind", () => {
    expect(describeSlotKind("DATA")).toBe("text");
    expect(describeSlotKind("IMAGE")).toBe("photo");
    expect(describeSlotKind("AUDIO")).toBe("audio file");
    expect(describeSlotKind("VIDEO")).toBe("video");
  });
});

describe("advanceTrackCursor", () => {
  it("opens the first track on first entry (empty tracks, trackCount 1)", () => {
    const result = advanceTrackCursor([], 2, 1);
    expect(result).toEqual({ tracks: [[]], allTracksDone: false });
  });

  it("waits for more values when the current track is incomplete", () => {
    const result = advanceTrackCursor([["a"]], 2, 1);
    expect(result).toEqual({ tracks: [["a"]], allTracksDone: false });
  });

  it("marks all tracks done once the last track is complete and trackCount is reached", () => {
    const result = advanceTrackCursor([["a", "b"]], 2, 1);
    expect(result).toEqual({ tracks: [["a", "b"]], allTracksDone: true });
  });

  it("opens the next track when the current one completes but more remain (Album)", () => {
    const result = advanceTrackCursor([["a", "b"]], 2, 2);
    expect(result).toEqual({ tracks: [["a", "b"], []], allTracksDone: false });
  });

  it("resolves a zero-asset Template's single track immediately", () => {
    const result = advanceTrackCursor([], 0, 1);
    expect(result).toEqual({ tracks: [[]], allTracksDone: true });
  });

  it("resolves every track of a zero-asset Template's Album in one call", () => {
    const result = advanceTrackCursor([], 0, 3);
    expect(result).toEqual({ tracks: [[], [], []], allTracksDone: true });
  });

  it("does not mutate the input tracks array", () => {
    const input = [["a"]];
    advanceTrackCursor(input, 2, 2);
    expect(input).toEqual([["a"]]);
  });
});
