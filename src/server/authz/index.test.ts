import { describe, expect, it } from "vitest";

import {
  assertDepartmentScopeOrNotFound,
  assertSameDepartment,
  authorize,
  departmentScopeFilter,
  hasAtLeastRole,
  requireRole,
  toActor,
  type Actor,
} from "./index";

const user = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

describe("toActor", () => {
  it("projects a CurrentUser down to the minimal Actor shape", () => {
    expect(
      toActor({
        id: "u1",
        role: "MANAGER",
        departmentId: "dept-a",
        displayName: "Someone",
        email: "someone@example.com",
      }),
    ).toEqual({ userId: "u1", role: "MANAGER", departmentId: "dept-a" });
  });
});

describe("hasAtLeastRole / requireRole", () => {
  it("USER does not meet a MANAGER floor", () => {
    expect(hasAtLeastRole(user({ role: "USER" }), "MANAGER")).toBe(false);
    expect(() => requireRole(user({ role: "USER" }), "MANAGER")).toThrow();
  });

  it("MANAGER meets a MANAGER floor but not ADMIN", () => {
    expect(hasAtLeastRole(user({ role: "MANAGER" }), "MANAGER")).toBe(true);
    expect(hasAtLeastRole(user({ role: "MANAGER" }), "ADMIN")).toBe(false);
  });

  it("ADMIN meets every floor", () => {
    expect(hasAtLeastRole(user({ role: "ADMIN" }), "ADMIN")).toBe(true);
    expect(() => requireRole(user({ role: "ADMIN" }), "ADMIN")).not.toThrow();
  });
});

describe("assertSameDepartment", () => {
  it("allows a matching department", () => {
    expect(() =>
      assertSameDepartment(user({ departmentId: "dept-a" }), "dept-a"),
    ).not.toThrow();
  });

  it("forbids (403-style) a mismatched department for USER/MANAGER", () => {
    const actor = user({ role: "MANAGER", departmentId: "dept-a" });
    expect(() => assertSameDepartment(actor, "dept-b")).toThrow(
      expect.objectContaining({ kind: "forbidden" }),
    );
  });

  it("ADMIN bypasses department matching", () => {
    const admin = user({ role: "ADMIN", departmentId: "dept-a" });
    expect(() => assertSameDepartment(admin, "dept-b")).not.toThrow();
  });
});

describe("assertDepartmentScopeOrNotFound", () => {
  it("throws not_found (never forbidden) for a cross-department resource", () => {
    const actor = user({ role: "USER", departmentId: "dept-a" });
    expect(() => assertDepartmentScopeOrNotFound(actor, "dept-b")).toThrow(
      expect.objectContaining({ kind: "not_found" }),
    );
  });

  it("allows a same-department resource", () => {
    const actor = user({ departmentId: "dept-a" });
    expect(() =>
      assertDepartmentScopeOrNotFound(actor, "dept-a"),
    ).not.toThrow();
  });

  it("ADMIN bypasses", () => {
    const admin = user({ role: "ADMIN", departmentId: "dept-a" });
    expect(() =>
      assertDepartmentScopeOrNotFound(admin, "dept-b"),
    ).not.toThrow();
  });
});

describe("departmentScopeFilter", () => {
  it("scopes USER/MANAGER to their own department", () => {
    expect(departmentScopeFilter(user({ departmentId: "dept-a" }))).toEqual({
      departmentId: "dept-a",
    });
    expect(
      departmentScopeFilter(user({ role: "MANAGER", departmentId: "dept-a" })),
    ).toEqual({ departmentId: "dept-a" });
  });

  it("applies no filter for ADMIN (system-wide)", () => {
    expect(departmentScopeFilter(user({ role: "ADMIN" }))).toEqual({});
  });
});

describe("authorize", () => {
  it("throws internal for an unregistered capability — a programming error, not a policy decision", () => {
    expect(() =>
      authorize(user({ role: "ADMIN" }), "made_up:capability"),
    ).toThrow(expect.objectContaining({ kind: "internal" }));
  });

  it("enforces the registered role floor", () => {
    expect(() => authorize(user({ role: "USER" }), "user:view")).toThrow(
      expect.objectContaining({ kind: "forbidden" }),
    );
    expect(() =>
      authorize(user({ role: "MANAGER" }), "user:view"),
    ).not.toThrow();
  });

  it("additionally enforces department scope when departmentId is given", () => {
    const manager = user({ role: "MANAGER", departmentId: "dept-a" });
    expect(() =>
      authorize(manager, "user:manage", { departmentId: "dept-b" }),
    ).toThrow(expect.objectContaining({ kind: "forbidden" }));
    expect(() =>
      authorize(manager, "user:manage", { departmentId: "dept-a" }),
    ).not.toThrow();
  });

  it("ADMIN passes every registered capability regardless of department", () => {
    const admin = user({ role: "ADMIN", departmentId: "dept-a" });
    expect(() =>
      authorize(admin, "department:manage", { departmentId: "dept-b" }),
    ).not.toThrow();
  });
});
