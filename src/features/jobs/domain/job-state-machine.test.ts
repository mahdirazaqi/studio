import { describe, expect, it } from "vitest";

import {
  canCancelFromState,
  canRetryFromState,
  isTerminalState,
  isValidTransition,
} from "@/features/jobs/domain/job-state-machine";
import { JOB_STATES, type JobState } from "@/features/jobs/domain/job";

describe("isValidTransition", () => {
  const valid: [JobState, JobState][] = [
    ["QUEUED", "CLAIMED"],
    ["QUEUED", "CANCELED"],
    ["CLAIMED", "RENDERING"],
    ["CLAIMED", "QUEUED"],
    ["CLAIMED", "ERROR"],
    ["CLAIMED", "CANCELED"],
    ["RENDERING", "RENDERED"],
    ["RENDERING", "ERROR"],
    ["RENDERING", "CANCELED"],
  ];

  it.each(valid)("allows %s -> %s", (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });

  const invalid: [JobState, JobState][] = [
    ["RENDERED", "QUEUED"],
    ["RENDERED", "RENDERING"],
    ["RENDERED", "ERROR"],
    ["RENDERED", "DOWNLOADING" as JobState],
    ["CANCELED", "RENDERING"],
    ["QUEUED", "RENDERING"],
    ["QUEUED", "RENDERED"],
    ["ERROR", "QUEUED"],
    ["ERROR", "CANCELED"],
    ["CANCELED", "RENDERED"],
  ];

  it.each(invalid)("rejects %s -> %s", (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });

  it("has an entry for every declared state, and never allows a self-loop", () => {
    for (const state of JOB_STATES) {
      expect(isValidTransition(state, state)).toBe(false);
    }
  });
});

describe("isTerminalState", () => {
  it("treats RENDERED, ERROR, and CANCELED as terminal", () => {
    expect(isTerminalState("RENDERED")).toBe(true);
    expect(isTerminalState("ERROR")).toBe(true);
    expect(isTerminalState("CANCELED")).toBe(true);
  });

  it("treats every other state as non-terminal", () => {
    expect(isTerminalState("QUEUED")).toBe(false);
    expect(isTerminalState("CLAIMED")).toBe(false);
    expect(isTerminalState("RENDERING")).toBe(false);
  });
});

describe("canCancelFromState", () => {
  it("allows canceling from QUEUED, CLAIMED, RENDERING", () => {
    expect(canCancelFromState("QUEUED")).toBe(true);
    expect(canCancelFromState("CLAIMED")).toBe(true);
    expect(canCancelFromState("RENDERING")).toBe(true);
  });

  it("forbids canceling once RENDERED, or already terminal", () => {
    expect(canCancelFromState("RENDERED")).toBe(false);
    expect(canCancelFromState("ERROR")).toBe(false);
    expect(canCancelFromState("CANCELED")).toBe(false);
  });
});

describe("canRetryFromState", () => {
  it("allows retry only from ERROR and CANCELED", () => {
    expect(canRetryFromState("ERROR")).toBe(true);
    expect(canRetryFromState("CANCELED")).toBe(true);
  });

  it("forbids retry from every active or successfully-completed state", () => {
    expect(canRetryFromState("QUEUED")).toBe(false);
    expect(canRetryFromState("CLAIMED")).toBe(false);
    expect(canRetryFromState("RENDERING")).toBe(false);
    expect(canRetryFromState("RENDERED")).toBe(false);
  });
});
