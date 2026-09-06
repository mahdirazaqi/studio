import type { SafeJobDetail } from "@/features/jobs/domain/job";
import type { ConfirmWizardResult } from "@/features/telegram/use-cases/confirm-wizard";
import type { CancelAllJobsResult } from "@/features/telegram/use-cases/cancel-all-jobs-for-telegram";
import {
  describeSlotKind,
  type WizardSlot,
} from "@/features/telegram/domain/wizard";

/**
 * Pure message-text builders (Phase 8 brief §55) — no Telegraf types, no I/O.
 * English only, matching Studio's documented UI language
 * (docs/frontend/conventions.md). Never includes a stack trace, a raw
 * Prisma/internal error, a database id beyond a Job's own (already
 * user-facing) id, or a storage path — errors shown here are always an
 * `AppError.message`, which is already written to be end-user safe
 * (`AppError.expose`).
 */

export const notLinkedMessage =
  "Welcome to Studio! To use the bot, please authenticate by sharing your phone number.";

export function welcomeBackMessage(fullName: string): string {
  return `Welcome back, ${fullName}! What would you like to do?`;
}

export const linkSuccessMessage =
  "You're linked! 👍 What would you like to do?";

export const linkFailedMessage =
  "No matching Studio account was found for this phone number. Please contact your administrator.";

export const noTemplatesMessage =
  "There are no active templates available in your department right now.";

export function pickTemplateMessage(kind: "single" | "album"): string {
  return kind === "single"
    ? "Choose a template:"
    : "Choose a template for your album:";
}

export const askDeliveryMessage =
  "Do you want this job delivered to YouTube when rendering completes?";

export const askTrackCountMessage =
  "How many tracks are in this album? (send a number)";

export function askSlotMessage(slot: WizardSlot): string {
  return `Please send the ${describeSlotKind(slot.kind)} for "${slot.key}".`;
}

export function confirmSummaryMessage(
  templateName: string,
  trackCount: number,
  deliverToYouTube: boolean,
): string {
  const jobWord = trackCount === 1 ? "job" : "jobs";
  return (
    `Ready to create ${trackCount} ${jobWord} from template "${templateName}"` +
    `${deliverToYouTube ? " (will be delivered to YouTube)" : ""}.\n\n` +
    "Confirm?"
  );
}

export const wizardCancelledMessage = "Cancelled. Nothing was created.";

export const alreadyProcessingMessage =
  "This is already being processed — please wait a moment.";

export function jobsCreatedMessage(
  result: Extract<ConfirmWizardResult, { outcome: "completed" }>,
): string {
  const { createdJobs, totalRequested, failureMessage } = result;
  if (!failureMessage) {
    const jobWord = createdJobs.length === 1 ? "job" : "jobs";
    return `✅ ${createdJobs.length} ${jobWord} sent to the queue.`;
  }
  return (
    `⚠️ ${createdJobs.length} of ${totalRequested} jobs were created before an error occurred:\n` +
    `${failureMessage}\n\n` +
    "The remaining jobs were not created."
  );
}

export function jobDetailMessage(job: SafeJobDetail): string {
  const lines = [
    `Title: ${job.title}`,
    `Template: ${job.templateName}`,
    `State: ${job.state}`,
  ];
  if (job.progress !== null) lines.push(`Progress: ${job.progress}%`);
  if (job.state === "ERROR" && job.errorReason) {
    lines.push(`Error: ${job.errorReason}`);
  }
  return lines.join("\n");
}

export const jobRetriedMessage = "🔁 Job retried successfully.";
export const jobCanceledMessage = "🚫 Job canceled successfully.";

export function noRecentJobsMessage(): string {
  return "There are no jobs in your department yet.";
}

export function recentJobsHeading(): string {
  return "Last 10 jobs:";
}

export function cancelAllResultMessage(result: CancelAllJobsResult): string {
  if (result.canceledCount === 0 && result.failedCount === 0) {
    return "There are no cancelable jobs in your department right now.";
  }
  const lines = [`🔴 Canceled ${result.canceledCount} job(s).`];
  if (result.failedCount > 0) {
    lines.push(
      `${result.failedCount} job(s) could not be canceled and were skipped.`,
    );
  }
  return lines.join("\n");
}

export const sessionExpiredMessage =
  "Your session expired, so this was reset. Please choose an option from the menu to start again.";

export const sessionCorruptedMessage =
  "Something went wrong with your previous session, so it was reset. Please choose an option from the menu to start again.";

export const unknownInputMessage =
  "I didn't understand that. Please choose an option from the menu, or use /cancel to reset.";

export const unlinkedActionMessage =
  "Please authenticate first by sharing your phone number.";

export const genericErrorPrefix = "❌ ";
