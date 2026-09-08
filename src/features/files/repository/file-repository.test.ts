import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    file: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: (...args: unknown[]) => count(...args),
    },
  },
}));

const { listFiles } = await import("./file-repository");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "u1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
});

/**
 * `ListFilesFilters.departmentId` is advisory narrowing, honored only for
 * ADMIN — a non-ADMIN's own department must never be overridden by a
 * client-supplied value (docs/architecture/files.md; the File Picker's
 * `departmentId` prop is not itself a security boundary because of this).
 */
describe("listFiles — departmentId narrowing", () => {
  it("ignores a client-supplied departmentId for a non-ADMIN, keeping their own department scope", async () => {
    await listFiles(actor({ role: "MANAGER", departmentId: "dept-a" }), {
      category: "GALLERY_ASSET",
      departmentId: "dept-b",
      page: 1,
      pageSize: 24,
    });
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where.departmentId).toBe("dept-a");
  });

  it("honors departmentId narrowing for ADMIN", async () => {
    await listFiles(actor({ role: "ADMIN" }), {
      category: "GALLERY_ASSET",
      departmentId: "dept-b",
      page: 1,
      pageSize: 24,
    });
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where.departmentId).toBe("dept-b");
  });

  it("leaves ADMIN unscoped (all departments) when no departmentId is given", async () => {
    await listFiles(actor({ role: "ADMIN" }), {
      category: "GALLERY_ASSET",
      page: 1,
      pageSize: 24,
    });
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where.departmentId).toBeUndefined();
  });
});
