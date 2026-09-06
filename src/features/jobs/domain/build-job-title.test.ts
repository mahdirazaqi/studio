import { describe, expect, it } from "vitest";

import { buildJobTitle } from "@/features/jobs/domain/build-job-title";

describe("buildJobTitle", () => {
  it("joins values with ' | '", () => {
    expect(buildJobTitle(["Hello", "World"])).toBe("Hello | World");
  });

  it("returns a single value unchanged", () => {
    expect(buildJobTitle(["Only"])).toBe("Only");
  });

  it("returns an empty string for no data assets", () => {
    expect(buildJobTitle([])).toBe("");
  });
});
