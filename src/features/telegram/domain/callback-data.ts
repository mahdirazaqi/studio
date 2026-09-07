/**
 * Inline-keyboard callback action codes (docs/integrations/telegram.md
 * "Callback routing", Phase 8 brief §19). Short, stable, and independent of
 * any button label — renaming a button's visible text can never break
 * routing, unlike legacy's emoji-prefix dispatch (`🔹`, `🔁`, `🚫`, `📜`,
 * `📃`), which tightly coupled UI copy to `@Action` regexes.
 *
 * Pure encode/decode only. Every decoded id is still just an untrusted
 * string from the caller's perspective — the use-case layer re-validates
 * existence, department scope, and state before acting on it (Phase 8 brief
 * §19 "never assume a callback is trustworthy just because Studio generated
 * the button").
 */

export type CallbackAction =
  | { kind: "pick_template"; flow: "SINGLE_TRACK"; templateId: string }
  | { kind: "pick_template"; flow: "ALBUM"; templateId: string }
  | { kind: "confirm_creation"; confirmed: boolean }
  | { kind: "job_detail"; jobId: string }
  | { kind: "job_retry"; jobId: string }
  | { kind: "job_cancel"; jobId: string };

const PREFIX = {
  pickSingle: "tpl:s:",
  pickAlbum: "tpl:a:",
  confirmYes: "cfm:y",
  confirmNo: "cfm:n",
  jobDetail: "job:d:",
  jobRetry: "job:r:",
  jobCancel: "job:c:",
} as const;

export function encodePickTemplate(
  flow: "SINGLE_TRACK" | "ALBUM",
  templateId: string,
): string {
  return `${flow === "SINGLE_TRACK" ? PREFIX.pickSingle : PREFIX.pickAlbum}${templateId}`;
}

export function encodeConfirmCreation(confirmed: boolean): string {
  return confirmed ? PREFIX.confirmYes : PREFIX.confirmNo;
}

export function encodeJobDetail(jobId: string): string {
  return `${PREFIX.jobDetail}${jobId}`;
}

export function encodeJobRetry(jobId: string): string {
  return `${PREFIX.jobRetry}${jobId}`;
}

export function encodeJobCancel(jobId: string): string {
  return `${PREFIX.jobCancel}${jobId}`;
}

/** `null` for anything unrecognized — callers must treat that as "ignore". */
export function decodeCallbackData(data: string): CallbackAction | null {
  if (data.startsWith(PREFIX.pickSingle)) {
    const templateId = data.slice(PREFIX.pickSingle.length);
    return templateId
      ? { kind: "pick_template", flow: "SINGLE_TRACK", templateId }
      : null;
  }
  if (data.startsWith(PREFIX.pickAlbum)) {
    const templateId = data.slice(PREFIX.pickAlbum.length);
    return templateId
      ? { kind: "pick_template", flow: "ALBUM", templateId }
      : null;
  }
  if (data === PREFIX.confirmYes)
    return { kind: "confirm_creation", confirmed: true };
  if (data === PREFIX.confirmNo)
    return { kind: "confirm_creation", confirmed: false };
  if (data.startsWith(PREFIX.jobDetail)) {
    const jobId = data.slice(PREFIX.jobDetail.length);
    return jobId ? { kind: "job_detail", jobId } : null;
  }
  if (data.startsWith(PREFIX.jobRetry)) {
    const jobId = data.slice(PREFIX.jobRetry.length);
    return jobId ? { kind: "job_retry", jobId } : null;
  }
  if (data.startsWith(PREFIX.jobCancel)) {
    const jobId = data.slice(PREFIX.jobCancel.length);
    return jobId ? { kind: "job_cancel", jobId } : null;
  }
  return null;
}
