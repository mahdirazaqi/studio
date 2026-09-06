import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import { departmentScopeFilter, type Actor } from "@/server/authz";
import type { Role } from "@/lib/roles";
import type { Paginated } from "@/types";
import type { SafeUser, UserStatus } from "@/features/users/domain/user";

/**
 * User repository. The only module that queries the `User` table.
 *
 * `passwordHash` is selected **only** by `findUserCredentialByEmail` (the
 * sign-in credential check) — every other function here uses
 * `SAFE_USER_SELECT`, which omits it entirely, so a hash can never
 * accidentally end up in a value handed back up the call stack toward a
 * client (docs/architecture/authentication.md).
 */

export interface UserCredentialRecord {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: Role;
  status: SafeUser["status"];
  departmentId: string;
}

/** Case-insensitive lookup by email, for the sign-in credential check only. */
export async function findUserCredentialByEmail(
  email: string,
): Promise<UserCredentialRecord | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      email: true,
      fullName: true,
      passwordHash: true,
      role: true,
      status: true,
      departmentId: true,
    },
  });
  return user;
}

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type SafeUserRow = Prisma.UserGetPayload<{ select: typeof SAFE_USER_SELECT }>;

function toSafeUser(row: SafeUserRow): SafeUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    status: row.status,
    departmentId: row.departmentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CreateUserData {
  email: string;
  fullName: string;
  passwordHash: string;
  role: Role;
  departmentId: string;
}

export async function createUser(data: CreateUserData): Promise<SafeUser> {
  try {
    const row = await db.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        fullName: data.fullName,
        passwordHash: data.passwordHash,
        role: data.role,
        departmentId: data.departmentId,
      },
      select: SAFE_USER_SELECT,
    });
    return toSafeUser(row);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflictError("A user with this email address already exists.");
    }
    throw error;
  }
}

/**
 * Load a User the actor is allowed to see, or `null` for both "doesn't
 * exist" and "exists in another department" (docs/architecture/authorization.md
 * 403-vs-404 guidance) — mirrors `findTemplateInScope`/`findJobInScope`
 * exactly, so a MANAGER probing another department's user id learns nothing
 * about whether it exists.
 */
export async function findUserInScope(
  actor: Actor,
  userId: string,
): Promise<SafeUser | null> {
  const row = await db.user.findFirst({
    where: { id: userId, ...departmentScopeFilter(actor) },
    select: SAFE_USER_SELECT,
  });
  return row ? toSafeUser(row) : null;
}

export interface ListUsersFilters {
  q?: string;
  page: number;
  pageSize: number;
}

export async function listUsers(
  actor: Actor,
  filters: ListUsersFilters,
): Promise<Paginated<SafeUser>> {
  const where: Prisma.UserWhereInput = {
    ...departmentScopeFilter(actor),
    ...(filters.q
      ? {
          OR: [
            { fullName: { contains: filters.q, mode: "insensitive" as const } },
            { email: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.user.count({ where }),
  ]);

  return {
    items: rows.map(toSafeUser),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
}

export async function setUserStatus(
  userId: string,
  status: UserStatus,
): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { status } });
}

export async function setUserRole(userId: string, role: Role): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { role } });
}
