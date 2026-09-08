import { describe, expect, it } from "vitest";

import { formatDurationHHMMSS } from "./format-duration";

describe("formatDurationHHMMSS", () => {
  it("formats zero", () => {
    expect(formatDurationHHMMSS(0)).toBe("00:00:00");
  });

  it("formats 1 second", () => {
    expect(formatDurationHHMMSS(1)).toBe("00:00:01");
  });

  it("formats 59 seconds", () => {
    expect(formatDurationHHMMSS(59)).toBe("00:00:59");
  });

  it("formats exactly 60 seconds as 1 minute", () => {
    expect(formatDurationHHMMSS(60)).toBe("00:01:00");
  });

  it("formats 61 seconds", () => {
    expect(formatDurationHHMMSS(61)).toBe("00:01:01");
  });

  it("formats exactly 1 hour", () => {
    expect(formatDurationHHMMSS(3600)).toBe("01:00:00");
  });

  it("formats 1 hour plus seconds", () => {
    expect(formatDurationHHMMSS(3661)).toBe("01:01:01");
  });

  it("formats multiple hours (always zero-padded, never bare M:SS)", () => {
    expect(formatDurationHHMMSS(5071)).toBe("01:24:31"); // matches the brief's example
  });

  it("always shows all three components even under a minute", () => {
    expect(formatDurationHHMMSS(331)).toBe("00:05:31");
  });

  it("floors fractional seconds rather than rounding or erroring", () => {
    expect(formatDurationHHMMSS(331.42)).toBe("00:05:31");
    expect(formatDurationHHMMSS(59.9)).toBe("00:00:59");
  });

  it("supports durations beyond 24 hours without wrapping", () => {
    expect(formatDurationHHMMSS(27 * 3600 + 15 * 60 + 42)).toBe("27:15:42");
  });

  it("returns an em dash for null", () => {
    expect(formatDurationHHMMSS(null)).toBe("—");
  });

  it("returns an em dash for undefined", () => {
    expect(formatDurationHHMMSS(undefined)).toBe("—");
  });

  it("returns an em dash for NaN, Infinity, and negative values", () => {
    expect(formatDurationHHMMSS(NaN)).toBe("—");
    expect(formatDurationHHMMSS(Infinity)).toBe("—");
    expect(formatDurationHHMMSS(-Infinity)).toBe("—");
    expect(formatDurationHHMMSS(-1)).toBe("—");
  });
});
