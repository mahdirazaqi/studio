/**
 * Formats a duration (in whole seconds) as `HH:MM:SS` — always all three
 * components, zero-padded, never a raw decimal/relative format. This is a
 * duration, not a timestamp: never use `Intl.DateTimeFormat`/`Date` for it
 * (docs/domain/jobs.md "Video duration & render time").
 *
 * Supports durations beyond 24 hours by letting the hours component grow
 * past two digits (e.g. `27:15:42`) rather than wrapping — a render can
 * legitimately take longer than a day.
 *
 * Returns `"—"` for `null`/`undefined`/`NaN`/negative/non-finite input —
 * never `NaN`, `Infinity`, `undefined`, or `null` rendered as text. Fractional
 * seconds are floored (a duration is reported in whole seconds throughout
 * the domain — `Job.durationSeconds` — so this is defensive, not a real
 * input shape).
 */
export function formatDurationHHMMSS(
  totalSeconds: number | null | undefined,
): string {
  if (
    totalSeconds === null ||
    totalSeconds === undefined ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return "—";
  }

  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
