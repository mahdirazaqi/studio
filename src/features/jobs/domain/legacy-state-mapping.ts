import { JOB_STATES, type JobState } from "@/features/jobs/domain/job";

/**
 * Legacy numeric state → Studio canonical state
 * (docs/integrations/worker-api.md "State mapping at the boundary"). The
 * Worker API accepts **both** the legacy integer the current Worker already
 * sends and the new Studio name, mapped and validated against the state
 * machine at the boundary — the Worker's own upgrade can happen on its own
 * schedule.
 *
 * **Revised, ADR-0041: legacy `6` (Uploading) and `7` (Uploaded) are no
 * longer mapped.** Studio has no YouTube-upload step to report — `5`
 * (Rendered) is now the Worker's own final report for a successful render.
 * A Worker still sending `6`/`7` gets the same `422 validation` error as any
 * other unrecognized value, naming the supported values, rather than a
 * silent mapping to a state that no longer exists.
 */
const LEGACY_STATE_BY_INT: Readonly<Record<number, JobState>> = {
  0: "QUEUED", // Queued
  1: "CLAIMED", // Fetched
  2: "RENDERING", // Downloading
  3: "RENDERING", // Started
  4: "RENDERING", // InProgress
  5: "RENDERED", // Rendered
  8: "ERROR", // Error
  9: "CANCELED", // Cancel
};

/**
 * Maps a Worker-submitted state value (legacy integer 0–9, or a Studio
 * canonical name, case-insensitive) to a `JobState`. Returns `null` for
 * anything else — the caller turns that into a `validation` error naming the
 * supported values, never a silent fallback.
 */
export function mapWorkerState(input: number | string): JobState | null {
  if (typeof input === "number") {
    return LEGACY_STATE_BY_INT[input] ?? null;
  }
  const upper = input.trim().toUpperCase();
  return (JOB_STATES as readonly string[]).includes(upper)
    ? (upper as JobState)
    : null;
}
