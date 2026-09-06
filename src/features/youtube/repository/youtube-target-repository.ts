import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import { departmentScopeFilter, type Actor } from "@/server/authz";
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
 */

const SAFE_TARGET_SELECT = {
  id: true,
  departmentId: true,
  name: true,
  youtubeChannelId: true,
  status: true,
  lastErrorReason: true,
  createdByUserId: true,
  createdBy: { select: { fullName: true } },
  createdAt: true,
} satisfies Prisma.YouTubeTargetSelect;

type SafeTargetRow = Prisma.YouTubeTargetGetPayload<{
  select: typeof SAFE_TARGET_SELECT;
}>;

function toSafeTarget(row: SafeTargetRow): SafeYouTubeTarget {
  return {
    id: row.id,
    departmentId: row.departmentId,
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
  departmentId: string;
  name: string;
  youtubeChannelId: string;
  encryptedRefreshToken: string;
  createdByUserId: string;
}

/** Upserts on `(departmentId, youtubeChannelId)` — reconnecting the same
 * channel (e.g. a rotated refresh token) updates the existing row instead of
 * creating a duplicate Target with stale history. */
export async function upsertYoutubeTarget(
  data: ConnectTargetData,
): Promise<SafeYouTubeTarget> {
  try {
    const row = await db.youTubeTarget.upsert({
      where: {
        departmentId_youtubeChannelId: {
          departmentId: data.departmentId,
          youtubeChannelId: data.youtubeChannelId,
        },
      },
      create: {
        departmentId: data.departmentId,
        name: data.name,
        youtubeChannelId: data.youtubeChannelId,
        encryptedRefreshToken: data.encryptedRefreshToken,
        createdByUserId: data.createdByUserId,
        status: "CONNECTED",
        lastErrorReason: null,
      },
      update: {
        name: data.name,
        encryptedRefreshToken: data.encryptedRefreshToken,
        status: "CONNECTED",
        lastErrorReason: null,
        encryptedAccessToken: null,
        accessTokenExpiresAt: null,
      },
      select: SAFE_TARGET_SELECT,
    });
    return toSafeTarget(row);
  } catch (error) {
    throw conflictError("Could not save this YouTube connection.", {
      cause: error,
    });
  }
}

export async function listYoutubeTargets(
  actor: Actor,
): Promise<SafeYouTubeTarget[]> {
  const rows = await db.youTubeTarget.findMany({
    where: departmentScopeFilter(actor),
    select: SAFE_TARGET_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSafeTarget);
}

/** Department-scoped, `CONNECTED` only — the set a Template's YouTube-channel
 * picker offers (docs/domain/templates.md). */
export async function listConnectedYoutubeTargetsInDepartment(
  departmentId: string,
): Promise<SafeYouTubeTarget[]> {
  const rows = await db.youTubeTarget.findMany({
    where: { departmentId, status: "CONNECTED" },
    select: SAFE_TARGET_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toSafeTarget);
}

export async function findYoutubeTargetInScope(
  actor: Actor,
  targetId: string,
): Promise<SafeYouTubeTarget | null> {
  const row = await db.youTubeTarget.findFirst({
    where: { id: targetId, ...departmentScopeFilter(actor) },
    select: SAFE_TARGET_SELECT,
  });
  return row ? toSafeTarget(row) : null;
}

/**
 * Verifies a Target id belongs to `departmentId` and is `CONNECTED` — the
 * same "resolve server-side, never trust the client's claim" pattern
 * `findGalleryFileIdsInDepartment` uses for `TemplateAsset.defaultFileId`
 * (docs/domain/templates.md "File Gallery Integration").
 */
export async function findConnectedYoutubeTargetInDepartment(
  departmentId: string,
  targetId: string,
): Promise<SafeYouTubeTarget | null> {
  const row = await db.youTubeTarget.findFirst({
    where: { id: targetId, departmentId, status: "CONNECTED" },
    select: SAFE_TARGET_SELECT,
  });
  return row ? toSafeTarget(row) : null;
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
