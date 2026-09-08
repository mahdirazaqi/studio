import { describe, expect, it } from "vitest";

import { computeRenderSeconds } from "./job";

/**
 * Render time — `startedAt -> renderedAt` — deliberately distinct from the
 * rendered video's own duration and from the Job's total lifetime including
 * queue wait (docs/domain/jobs.md "Video duration & render time").
 */
describe("computeRenderSeconds", () => {
  it("computes the whole-second gap between startedAt and renderedAt", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const renderedAt = new Date("2026-01-01T00:18:42.000Z");
    expect(computeRenderSeconds(startedAt, renderedAt)).toBe(18 * 60 + 42);
  });

  it("returns null when the Job hasn't started rendering yet", () => {
    expect(computeRenderSeconds(null, null)).toBeNull();
  });

  it("returns null when the Job has started but not yet rendered", () => {
    expect(computeRenderSeconds(new Date(), null)).toBeNull();
  });

  it("returns null when renderedAt is somehow set but startedAt is not (defensive — shouldn't happen)", () => {
    expect(computeRenderSeconds(null, new Date())).toBeNull();
  });

  it("returns 0 for a same-instant start/end (not null, not negative)", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    expect(computeRenderSeconds(t, t)).toBe(0);
  });

  it("returns null rather than a negative number for an inconsistent pair", () => {
    const startedAt = new Date("2026-01-01T00:10:00.000Z");
    const renderedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(computeRenderSeconds(startedAt, renderedAt)).toBeNull();
  });

  it("rounds sub-second differences to the nearest whole second", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const renderedAt = new Date("2026-01-01T00:00:01.600Z");
    expect(computeRenderSeconds(startedAt, renderedAt)).toBe(2);
  });

  it("supports render times over an hour", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const renderedAt = new Date("2026-01-01T01:24:30.000Z");
    expect(computeRenderSeconds(startedAt, renderedAt)).toBe(
      3600 + 24 * 60 + 30,
    );
  });
});
