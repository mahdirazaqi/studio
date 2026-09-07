import { Markup } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";

import {
  canCancelFromState,
  canRetryFromState,
} from "@/features/jobs/domain/job-state-machine";
import type { SafeJob, SafeJobDetail } from "@/features/jobs/domain/job";
import type { SafeTemplate } from "@/features/templates/domain/template";
import {
  encodeConfirmCreation,
  encodeJobCancel,
  encodeJobDetail,
  encodeJobRetry,
  encodePickTemplate,
} from "@/features/telegram/domain/callback-data";
import type { TelegramWizardFlow } from "@/features/telegram/domain/wizard";

/**
 * Every keyboard-building function here is pure (Telegraf `Markup` calls
 * only, no I/O) — the composer decides *when* to show one, this module only
 * decides *what it looks like*. Callback data always comes from
 * `domain/callback-data.ts`'s stable action codes, never button text
 * (Phase 8 brief §19).
 */

const MAIN_MENU_LABELS = {
  singleTrack: "🆕 Single Track",
  album: "💿 Album",
  listJobs: "📁 List of Jobs",
  cancelAll: "🔴 Cancel All Jobs",
} as const;

export { MAIN_MENU_LABELS };

export function authKeyboard() {
  return Markup.keyboard([
    Markup.button.contactRequest("Share Phone Number"),
  ]).resize();
}

export function mainMenuKeyboard() {
  return Markup.keyboard([
    [MAIN_MENU_LABELS.singleTrack],
    [MAIN_MENU_LABELS.album],
    [MAIN_MENU_LABELS.listJobs],
    [MAIN_MENU_LABELS.cancelAll],
  ]).resize();
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    rows.push(items.slice(i, i + size));
  return rows;
}

export function templatePickerKeyboard(
  templates: SafeTemplate[],
  flow: TelegramWizardFlow,
) {
  const buttons: InlineKeyboardButton[] = templates.map((template) =>
    Markup.button.callback(
      template.name,
      encodePickTemplate(flow, template.id),
    ),
  );
  return Markup.inlineKeyboard(chunk(buttons, 2));
}

export function confirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Confirm", encodeConfirmCreation(true)),
      Markup.button.callback("✖️ Cancel", encodeConfirmCreation(false)),
    ],
  ]);
}

export function jobListKeyboard(jobs: SafeJob[]) {
  const buttons: InlineKeyboardButton[] = jobs.map((job) =>
    Markup.button.callback(
      `${job.progress ?? 0}% - ${job.title}`,
      encodeJobDetail(job.id),
    ),
  );
  return Markup.inlineKeyboard(chunk(buttons, 1));
}

/** `null` when the job is terminal and offers neither action. */
export function jobDetailKeyboard(job: SafeJobDetail) {
  const buttons: InlineKeyboardButton[] = [];
  if (canRetryFromState(job.state)) {
    buttons.push(Markup.button.callback("🔁 Retry", encodeJobRetry(job.id)));
  }
  if (canCancelFromState(job.state)) {
    buttons.push(Markup.button.callback("🚫 Cancel", encodeJobCancel(job.id)));
  }
  return buttons.length > 0
    ? Markup.inlineKeyboard(chunk(buttons, 2))
    : undefined;
}
