import { describe, expect, it } from "vitest";

import { navigation, navigationForRole } from "./navigation";

describe("navigationForRole", () => {
  it("hides MANAGER/ADMIN items from a plain USER", () => {
    const groups = navigationForRole("USER");
    const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/users");
    expect(hrefs).not.toContain("/departments");
    expect(hrefs).toContain("/jobs");
  });

  it("shows /users to MANAGER but not /departments", () => {
    const hrefs = navigationForRole("MANAGER").flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(hrefs).toContain("/users");
    expect(hrefs).not.toContain("/departments");
  });

  it("shows everything to ADMIN", () => {
    const all = navigation.flatMap((g) => g.items.map((i) => i.href)).sort();
    const admin = navigationForRole("ADMIN")
      .flatMap((g) => g.items.map((i) => i.href))
      .sort();
    expect(admin).toEqual(all);
  });

  it("drops empty groups", () => {
    for (const group of navigationForRole("USER")) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("null role sees only unrestricted items", () => {
    const hrefs = navigationForRole(null).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(hrefs).not.toContain("/users");
    expect(hrefs).toContain("/");
  });
});
