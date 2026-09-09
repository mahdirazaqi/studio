import { describe, expect, it } from "vitest";

import { clampJobProgress, computeRenderSeconds } from "./job";

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

/**
 * Presentation-layer clamp for `Job.render-progress` UI
 * (`features/jobs/components/job-render-progress.tsx`, Phase 16) — never a
 * mutation of the stored value (the Worker-facing schema already enforces
 * `0..100`), only defensive normalization for display.
 */
describe("clampJobProgress", () => {
  it("passes an in-range value through unchanged", () => {
    expect(clampJobProgress(0)).toBe(0);
    expect(clampJobProgress(67)).toBe(67);
    expect(clampJobProgress(100)).toBe(100);
  });

  it("treats null (no report yet) as 0", () => {
    expect(clampJobProgress(null)).toBe(0);
  });

  it("clamps a value above 100", () => {
    expect(clampJobProgress(150)).toBe(100);
  });

  it("clamps a negative value to 0", () => {
    expect(clampJobProgress(-5)).toBe(0);
  });

  it("treats a non-finite value as 0", () => {
    expect(clampJobProgress(Number.NaN)).toBe(0);
    expect(clampJobProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
