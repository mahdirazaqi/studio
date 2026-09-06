/**
 * Pure domain type for the Department feature. No I/O, no Prisma import
 * (mirrors every other feature's `domain/`).
 *
 * No `status` field — Department deletion/archival is still OD-07, an
 * explicitly open decision (docs/domain/departments.md "Department
 * deletion"). Adding a status enum ahead of that being decided would be
 * speculative schema for a policy that doesn't exist yet.
 */
export interface SafeDepartment {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
