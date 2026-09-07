import { authorize, type Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import {
  findYoutubeTargetById,
  setYoutubeTargetStatus,
} from "@/features/youtube/repository/youtube-target-repository";

/**
 * Marks a Target `DISCONNECTED` — never a hard delete. A Template's
 * `youtubeTargetId` FK is `onDelete: SetNull`, so a hard delete would already
 * be historically safe, but keeping the row lets a historical Job's snapshot
 * still name the Target it was created with even after disconnection —
 * deleting the row would lose that for every *future* lookup (a historical
 * Job never depends on this row surviving either way — its `snapshot` already
 * copied the Target's identity). Idempotent: disconnecting an
 * already-disconnected Target is a no-op, not an error.
 *
 * ADMIN-only (`youtube:manage`, revised ADR-0040) — no department scope to
 * check, since Target management itself is no longer department-scoped.
 */
export async function disconnectYoutubeTarget(
  actor: Actor,
  targetId: string,
): Promise<void> {
  authorize(actor, "youtube:manage");

  const target = await findYoutubeTargetById(targetId);
  if (!target) throw notFoundError();

  if (target.status === "DISCONNECTED") return;
  await setYoutubeTargetStatus(targetId, "DISCONNECTED");
}
