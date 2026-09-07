import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import type {
  SafeWorkerApiKey,
  WorkerApiKeyStatus,
} from "@/features/worker-keys/domain/worker-api-key";

/**
 * The only module that queries the `WorkerApiKey` table (mirrors every
 * other feature's repository). `keyHash` is selected **nowhere** in this
 * file — the one function that legitimately needs it,
 * `@/server/worker-auth`'s `authenticateWorker`, queries `db.workerApiKey`
 * directly, the same "boundary layer keeps its own narrow credential query"
 * split `@/server/auth/session.ts` already establishes for `Session`/`User`.
 */

const RAW_SELECT = {
  id: true,
  name: true,
  status: true,
  createdByUserId: true,
  createdBy: { select: { fullName: true } },
  lastUsedAt: true,
  createdAt: true,
  departments: { select: { id: true } },
} satisfies Prisma.WorkerApiKeySelect;

type RawRow = Prisma.WorkerApiKeyGetPayload<{ select: typeof RAW_SELECT }>;

function toSafe(row: RawRow): SafeWorkerApiKey {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    departmentIds: row.departments.map((department) => department.id),
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy?.fullName ?? null,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

export interface CreateWorkerApiKeyData {
  name: string;
  keyHash: string;
  departmentIds: string[];
  createdByUserId: string;
}

export async function createWorkerApiKey(
  data: CreateWorkerApiKeyData,
): Promise<SafeWorkerApiKey> {
  try {
    const row = await db.workerApiKey.create({
      data: {
        name: data.name,
        keyHash: data.keyHash,
        createdByUserId: data.createdByUserId,
        status: "ACTIVE",
        departments: { connect: data.departmentIds.map((id) => ({ id })) },
      },
      select: RAW_SELECT,
    });
    return toSafe(row);
  } catch (error) {
    // A `keyHash` collision is a cryptographically-negligible-odds event
    // (a 256-bit random secret), but caught anyway rather than surfaced as
    // a raw Prisma error — mirrors every other unique-constraint catch in
    // this codebase.
    throw conflictError("Could not create this Worker API Key.", {
      cause: error,
    });
  }
}

export async function listWorkerApiKeys(): Promise<SafeWorkerApiKey[]> {
  const rows = await db.workerApiKey.findMany({
    select: RAW_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSafe);
}

export async function findWorkerApiKeyById(
  id: string,
): Promise<SafeWorkerApiKey | null> {
  const row = await db.workerApiKey.findUnique({
    where: { id },
    select: RAW_SELECT,
  });
  return row ? toSafe(row) : null;
}

export async function setWorkerApiKeyStatus(
  id: string,
  status: WorkerApiKeyStatus,
): Promise<void> {
  await db.workerApiKey.update({ where: { id }, data: { status } });
}

/** Full replace, mirroring `setYoutubeTargetDepartments` — takes effect
 * immediately, since `@/server/worker-auth` re-resolves this relation fresh
 * on every single authenticated request (never cached). */
export async function setWorkerApiKeyDepartments(
  id: string,
  departmentIds: string[],
): Promise<SafeWorkerApiKey> {
  const row = await db.workerApiKey.update({
    where: { id },
    data: {
      departments: { set: departmentIds.map((depId) => ({ id: depId })) },
    },
    select: RAW_SELECT,
  });
  return toSafe(row);
}
