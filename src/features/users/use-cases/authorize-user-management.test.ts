import { describe, expect, it } from "vitest";

import type { Actor } from "@/server/authz";
import {
  assertCanChangeRole,
  assertCanCreateUserWithRole,
  assertCanSetActiveStatus,
  type ManagedUserRef,
} from "./authorize-user-management";

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

const target = (overrides: Partial<ManagedUserRef> = {}): ManagedUserRef => ({
  id: "target-1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

function forbidden() {
  return expect.objectContaining({ kind: "forbidden" });
}

describe("assertCanCreateUserWithRole", () => {
  it("USER can never create a user", () => {
    expect(() =>
      assertCanCreateUserWithRole(actor({ role: "USER" }), "dept-a", "USER"),
    ).toThrow(forbidden());
  });

  it("MANAGER may create a USER in their own department", () => {
    expect(() =>
      assertCanCreateUserWithRole(
        actor({ role: "MANAGER", departmentId: "dept-a" }),
        "dept-a",
        "USER",
      ),
    ).not.toThrow();
  });

  it("MANAGER cannot create a user in another department", () => {
    expect(() =>
      assertCanCreateUserWithRole(
        actor({ role: "MANAGER", departmentId: "dept-a" }),
        "dept-b",
        "USER",
      ),
    ).toThrow(forbidden());
  });

  it("MANAGER cannot create a MANAGER or an ADMIN (OD-05 conservative default)", () => {
    const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
    expect(() =>
      assertCanCreateUserWithRole(manager, "dept-a", "MANAGER"),
    ).toThrow(forbidden());
    expect(() =>
      assertCanCreateUserWithRole(manager, "dept-a", "ADMIN"),
    ).toThrow(forbidden());
  });

  it("ADMIN may create any role in any department", () => {
    const admin = actor({ role: "ADMIN", departmentId: "dept-a" });
    expect(() =>
      assertCanCreateUserWithRole(admin, "dept-b", "ADMIN"),
    ).not.toThrow();
  });
});

describe("assertCanChangeRole", () => {
  it("USER can never change a role", () => {
    expect(() =>
      assertCanChangeRole(actor({ role: "USER" }), target(), "MANAGER"),
    ).toThrow(forbidden());
  });

  it("MANAGER cannot change a role — ADMIN-only pending OD-05", () => {
    const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
    expect(() =>
      assertCanChangeRole(manager, target({ departmentId: "dept-a" }), "USER"),
    ).toThrow(forbidden());
  });

  it("nobody may change their own role, including ADMIN", () => {
    const admin = actor({ role: "ADMIN", userId: "same-id" });
    expect(() =>
      assertCanChangeRole(
        admin,
        target({ id: "same-id", departmentId: "dept-a" }),
        "USER",
      ),
    ).toThrow(forbidden());
  });

  it("ADMIN may change another user's role", () => {
    const admin = actor({ role: "ADMIN", departmentId: "dept-a" });
    expect(() =>
      assertCanChangeRole(admin, target({ departmentId: "dept-b" }), "MANAGER"),
    ).not.toThrow();
  });
});

describe("assertCanSetActiveStatus", () => {
  it("USER can never disable/enable anyone", () => {
    expect(() =>
      assertCanSetActiveStatus(actor({ role: "USER" }), target()),
    ).toThrow(forbidden());
  });

  it("MANAGER may disable/enable a USER in their own department", () => {
    const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
    expect(() =>
      assertCanSetActiveStatus(
        manager,
        target({ role: "USER", departmentId: "dept-a" }),
      ),
    ).not.toThrow();
  });

  it("MANAGER cannot disable/enable a user in another department", () => {
    const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
    expect(() =>
      assertCanSetActiveStatus(
        manager,
        target({ role: "USER", departmentId: "dept-b" }),
      ),
    ).toThrow(forbidden());
  });

  it("MANAGER cannot disable/enable a peer MANAGER, even in their own department", () => {
    const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
    expect(() =>
      assertCanSetActiveStatus(
        manager,
        target({ role: "MANAGER", departmentId: "dept-a" }),
      ),
    ).toThrow(forbidden());
  });

  it("MANAGER cannot disable/enable an ADMIN", () => {
    const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
    expect(() =>
      assertCanSetActiveStatus(
        manager,
        target({ role: "ADMIN", departmentId: "dept-a" }),
      ),
    ).toThrow(forbidden());
  });

  it("nobody may disable/enable themselves, including ADMIN", () => {
    const admin = actor({ role: "ADMIN", userId: "same-id" });
    expect(() =>
      assertCanSetActiveStatus(
        admin,
        target({ id: "same-id", role: "ADMIN", departmentId: "dept-a" }),
      ),
    ).toThrow(forbidden());
  });

  it("ADMIN may disable/enable anyone else, any department, any role", () => {
    const admin = actor({ role: "ADMIN", departmentId: "dept-a" });
    expect(() =>
      assertCanSetActiveStatus(
        admin,
        target({ role: "MANAGER", departmentId: "dept-b" }),
      ),
    ).not.toThrow();
  });
});
