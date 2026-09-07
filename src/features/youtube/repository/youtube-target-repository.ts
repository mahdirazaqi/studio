import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import type {
  SafeYouTubeTarget,
  YouTubeTargetStatus,
} from "@/features/youtube/domain/youtube-target";

/**
 * The only module that queries the `YouTubeTarget` table (mirrors every other
 * feature's repository). `encryptedRefreshToken`/`encryptedAccessToken` are
 * selected **only** by the two functions that legitimately need them
 * (`findTokensById`, `updateAccessTokenCache`) — every list/detail read below
 * uses `SAFE_TARGET_SELECT`, which omits them entirely, so a token can never
 * accidentally end up in a value handed back up the call stack toward a
 * client.
 *
 * **Revised (ADR-0040):** `departmentId` is now a many-to-many
 * `departments` relation, not a single FK — a Target may serve any number of
 * Departments. Management is ADMIN-only (`youtube:manage`, revised from
 * MANAGER+), so no function here takes an `Actor`/department-scope filter
 * the way a MANAGER-reachable feature would — ADMIN sees and manages every
 * Target unconditionally.
 */

const RAW_TARGET_SELECT = {
  id: true,
  name: true,
  youtubeChannelId: true,
  status: true,
  lastErrorReason: true,
  createdByUserId: true,
  createdBy: { select: { fullName: true } },
  createdAt: true,
  departments: { select: { id: true } },
} satisfies Prisma.YouTubeTargetSelect;

type RawTargetRow = Prisma.YouTubeTargetGetPayload<{
  select: typeof RAW_TARGET_SELECT;
}>;

function toSafeTarget(row: RawTargetRow): SafeYouTubeTarget {
  return {
    id: row.id,
    departmentIds: row.departments.map((department) => department.id),
    name: row.name,
    youtubeChannelId: row.youtubeChannelId,
    status: row.status,
    lastErrorReason: row.lastErrorReason,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt,
  };
}

export interface ConnectTargetData {
  departmentIds: string[];
  name: string;
  youtubeChannelId: string;
  encryptedRefreshToken: string;
  createdByUserId: string;
}

/** Upserts on the now-globally-unique `youtubeChannelId` — reconnecting the
 * same real-world channel (e.g. a rotated refresh token) updates the
 * existing row (including replacing its Department assignments with
 * whatever was just submitted) instead of creating a duplicate. */
export async function upsertYoutubeTarget(
  data: ConnectTargetData,
): Promise<SafeYouTubeTarget> {
  try {
    const row = await db.youTubeTarget.upsert({
      where: { youtubeChannelId: data.youtubeChannelId },
      create: {
        name: data.name,
        youtubeChannelId: data.youtubeChannelId,
        encryptedRefreshToken: data.encryptedRefreshToken,
        createdByUserId: data.createdByUserId,
        status: "CONNECTED",
        lastErrorReason: null,
        departments: { connect: data.departmentIds.map((id) => ({ id })) },
      },
      update: {
        name: data.name,
        encryptedRefreshToken: data.encryptedRefreshToken,
        status: "CONNECTED",
        lastErrorReason: null,
        encryptedAccessToken: null,
        accessTokenExpiresAt: null,
        departments: { set: data.departmentIds.map((id) => ({ id })) },
      },
      select: RAW_TARGET_SELECT,
    });
    return toSafeTarget(row);
  } catch (error) {
    throw conflictError("Could not save this YouTube connection.", {
      cause: error,
    });
  }
}

/** ADMIN-only listing — every Target, regardless of Department assignment. */
export async function listYoutubeTargets(): Promise<SafeYouTubeTarget[]> {
  const rows = await db.youTubeTarget.findMany({
    select: RAW_TARGET_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSafeTarget);
}

/** The set a Template's YouTube-channel picker offers — every `CONNECTED`
 * Target assigned to `departmentId` (docs/domain/templates.md). */
export async function listConnectedYoutubeTargetsForDepartment(
  departmentId: string,
): Promise<SafeYouTubeTarget[]> {
  const rows = await db.youTubeTarget.findMany({
    where: { status: "CONNECTED", departments: { some: { id: departmentId } } },
    select: RAW_TARGET_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toSafeTarget);
}

/** ADMIN-only — no department scope, unlike most `findXInScope` helpers
 * elsewhere, since YouTube Target management itself is no longer
 * department-scoped (ADR-0040). */
export async function findYoutubeTargetById(
  targetId: string,
): Promise<SafeYouTubeTarget | null> {
  const row = await db.youTubeTarget.findUnique({
    where: { id: targetId },
    select: RAW_TARGET_SELECT,
  });
  return row ? toSafeTarget(row) : null;
}

/**
 * Verifies a Target id is assigned to `departmentId` and is `CONNECTED` —
 * the same "resolve server-side, never trust the client's claim" pattern
 * `findGalleryFileIdsInDepartment` uses for `TemplateAsset.defaultFileId`
 * (docs/domain/templates.md "File Gallery Integration"). Used by both
 * `verify-youtube-target.ts` (Template save) and `create-job.ts` (Job
 * creation) to check Template-department ↔ Target-assignment membership.
 */
export async function findConnectedYoutubeTargetForDepartment(
  departmentId: string,
  targetId: string,
): Promise<SafeYouTubeTarget | null> {
  const row = await db.youTubeTarget.findFirst({
    where: {
      id: targetId,
      status: "CONNECTED",
      departments: { some: { id: departmentId } },
    },
    select: RAW_TARGET_SELECT,
  });
  return row ? toSafeTarget(row) : null;
}

/** ADMIN edits a Target's Department scope (docs/integrations/youtube.md
 * "Editing scope") — a full replace, mirroring how a Template's asset list
 * is replaced wholesale on every edit rather than diffed. Takes effect
 * immediately: the very next Template-form load or Job creation re-reads
 * this relation fresh, there is nothing cached to invalidate. */
export async function setYoutubeTargetDepartments(
  targetId: string,
  departmentIds: string[],
): Promise<SafeYouTubeTarget> {
  const row = await db.youTubeTarget.update({
    where: { id: targetId },
    data: { departments: { set: departmentIds.map((id) => ({ id })) } },
    select: RAW_TARGET_SELECT,
  });
  return toSafeTarget(row);
}

export interface YoutubeTargetTokens {
  encryptedRefreshToken: string;
  encryptedAccessToken: string | null;
  accessTokenExpiresAt: Date | null;
}

/**
 * The one function that reads token ciphertext — never selects any other
 * field, and its return type documents that explicitly. Unscoped (Worker/
 * system-facing, like `findJobById`): the delivery orchestrator already
 * resolved this id from the Job's own immutable snapshot, not from client
 * input.
 */
export async function findTokensById(
  targetId: string,
): Promise<YoutubeTargetTokens | null> {
  return db.youTubeTarget.findUnique({
    where: { id: targetId },
    select: {
      encryptedRefreshToken: true,
      encryptedAccessToken: true,
      accessTokenExpiresAt: true,
    },
  });
}

export async function updateAccessTokenCache(
  targetId: string,
  encryptedAccessToken: string,
  accessTokenExpiresAt: Date,
): Promise<void> {
  await db.youTubeTarget.update({
    where: { id: targetId },
    data: { encryptedAccessToken, accessTokenExpiresAt },
  });
}

export async function markYoutubeTargetError(
  targetId: string,
  reason: string,
): Promise<void> {
  await db.youTubeTarget.update({
    where: { id: targetId },
    data: { status: "ERROR", lastErrorReason: reason },
  });
}

export async function setYoutubeTargetStatus(
  targetId: string,
  status: YouTubeTargetStatus,
): Promise<void> {
  await db.youTubeTarget.update({ where: { id: targetId }, data: { status } });
}
