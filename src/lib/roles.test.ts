import { describe, expect, it } from "vitest";

import { hasAtLeastRole, ROLE_RANK, ROLES } from "./roles";

describe("roles", () => {
  it("orders USER < MANAGER < ADMIN", () => {
    expect(ROLE_RANK.USER).toBeLessThan(ROLE_RANK.MANAGER);
    expect(ROLE_RANK.MANAGER).toBeLessThan(ROLE_RANK.ADMIN);
  });

  it("hasAtLeastRole is inclusive and monotonic", () => {
    expect(hasAtLeastRole("ADMIN", "MANAGER")).toBe(true);
    expect(hasAtLeastRole("MANAGER", "MANAGER")).toBe(true);
    expect(hasAtLeastRole("USER", "MANAGER")).toBe(false);
  });

  it("exposes exactly three roles", () => {
    expect([...ROLES]).toEqual(["USER", "MANAGER", "ADMIN"]);
  });
});
