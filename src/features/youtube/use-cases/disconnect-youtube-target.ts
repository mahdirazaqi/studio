import { authorize, type Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import {
  findYoutubeTargetInScope,
  setYoutubeTargetStatus,
} from "@/features/youtube/repository/youtube-target-repository";

/**
 * Marks a Target `DISCONNECTED` — never a hard delete. A Template's
 * `youtubeTargetId` FK is `onDelete: SetNull`, so a hard delete would already
 * be historically safe, but keeping the row lets `docs/domain/templates.md`'s
 * "a historical Job's snapshot still names the Target it was created with"
 * story include the Target's own name/channel id even after disconnection —
 * deleting the row would lose that for every *future* lookup (a historical
 * Job never depends on this row surviving either way — its `snapshot` already
 * copied the Target's identity, ADR-0039). Idempotent: disconnecting an
 * already-disconnected Target is a no-op, not an error.
 */
export async function disconnectYoutubeTarget(
  actor: Actor,
  targetId: string,
): Promise<void> {
  const target = await findYoutubeTargetInScope(actor, targetId);
  if (!target) throw notFoundError();

  authorize(actor, "youtube:manage", { departmentId: target.departmentId });

  if (target.status === "DISCONNECTED") return;
  await setYoutubeTargetStatus(targetId, "DISCONNECTED");
}
