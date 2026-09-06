import { describe, expect, it } from "vitest";

import { substituteTags } from "./tag-substitution";

describe("substituteTags", () => {
  it("replaces a {{layer}} placeholder with the matching data asset's value", () => {
    const tags = substituteTags(
      ["highlights", "{{artist}}", "weekly"],
      [{ layer: "artist", textValue: "The Band" }],
    );
    expect(tags).toEqual(["highlights", "The Band", "weekly"]);
  });

  it("drops a tag with an unresolved placeholder (valid tag substitution)", () => {
    const tags = substituteTags(["{{unmapped}}", "kept"], []);
    expect(tags).toEqual(["kept"]);
  });

  it("does not reproduce legacy's excludeTags set — a resolved {{album}}-style tag is kept", () => {
    const tags = substituteTags(
      ["{{album}}"],
      [{ layer: "album", textValue: "Greatest Hits" }],
    );
    expect(tags).toEqual(["Greatest Hits"]);
  });

  it("ignores data assets with no layer or a null value", () => {
    const tags = substituteTags(
      ["{{artist}}"],
      [
        { layer: null, textValue: "ignored" },
        { layer: "artist", textValue: null },
      ],
    );
    // Nothing resolves {{artist}} — dropped, matching the unresolved-placeholder rule.
    expect(tags).toEqual([]);
  });

  it("dedupes tags that end up identical after substitution", () => {
    const tags = substituteTags(
      ["{{a}}", "{{b}}"],
      [
        { layer: "a", textValue: "same" },
        { layer: "b", textValue: "same" },
      ],
    );
    expect(tags).toEqual(["same"]);
  });

  it("returns an empty array for an empty template tag list", () => {
    expect(substituteTags([], [])).toEqual([]);
  });
});
