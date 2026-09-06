import type { JobState } from "@/features/jobs/domain/job";

/**
 * The Job state machine (docs/domain/jobs.md "State machine", ADR-0029). The
 * single source of truth for every valid transition — nothing outside this
 * module decides whether `from -> to` is allowed.
 *
 * ```
 * QUEUED    → CLAIMED, CANCELED
 * CLAIMED   → RENDERING, QUEUED (requeue on worker timeout), ERROR, CANCELED
 * RENDERING → RENDERED, ERROR, CANCELED
 * RENDERED  → DELIVERING, UPLOADED (no delivery needed), ERROR
 * DELIVERING→ UPLOADED, ERROR
 * ERROR, UPLOADED, CANCELED → (terminal — no outgoing transitions)
 * ```
 */
const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  QUEUED: ["CLAIMED", "CANCELED"],
  CLAIMED: ["RENDERING", "QUEUED", "ERROR", "CANCELED"],
  RENDERING: ["RENDERED", "ERROR", "CANCELED"],
  RENDERED: ["DELIVERING", "UPLOADED", "ERROR"],
  DELIVERING: ["UPLOADED", "ERROR"],
  ERROR: [],
  UPLOADED: [],
  CANCELED: [],
};

export function isValidTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** A state with no outgoing transitions — the record's final lifecycle state. */
export function isTerminalState(state: JobState): boolean {
  return TRANSITIONS[state].length === 0;
}

/**
 * Cancelable states (docs/domain/jobs.md "Cancellation") — not `RENDERED`,
 * `DELIVERING`, `UPLOADED`, `ERROR`, or `CANCELED`. Matches legacy intent
 * (`$nin: [Rendered, Uploading, Uploaded, Cancel]`), enforced here instead of
 * left to a hand-rolled query.
 */
export const CANCELABLE_STATES: readonly JobState[] = [
  "QUEUED",
  "CLAIMED",
  "RENDERING",
];

export function canCancelFromState(state: JobState): boolean {
  return CANCELABLE_STATES.includes(state);
}

/**
 * Retry-eligible states (resolves OD-02's "which states" half — ADR-0029).
 * Legacy allowed retry from almost any non-terminal-ish state (everything
 * except `Rendered`/`Uploading`/`Uploaded`), including mid-render states —
 * retrying a Job that hasn't failed yet doesn't serve a real purpose and
 * risks a confusing duplicate render, so Studio narrows this to the two
 * failure-terminal states: a Job must have actually stopped (failed or been
 * canceled) before it can be retried.
 */
export const RETRY_ELIGIBLE_STATES: readonly JobState[] = ["ERROR", "CANCELED"];

export function canRetryFromState(state: JobState): boolean {
  return RETRY_ELIGIBLE_STATES.includes(state);
}
