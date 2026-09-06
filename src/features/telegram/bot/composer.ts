import { Composer } from "telegraf";
import type { Context } from "telegraf";

import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { getJob } from "@/features/jobs/use-cases/get-job";
import { listDepartmentJobs } from "@/features/jobs/use-cases/list-jobs";
import { retryJob } from "@/features/jobs/use-cases/retry-job";
import { cancelJob } from "@/features/jobs/use-cases/cancel-job";
import { listDepartmentTemplates } from "@/features/templates/use-cases/list-templates";
import { decodeCallbackData } from "@/features/telegram/domain/callback-data";
import { cancelAllJobsForTelegram } from "@/features/telegram/use-cases/cancel-all-jobs-for-telegram";
import { cancelWizard } from "@/features/telegram/use-cases/cancel-wizard";
import { collectAssetValue } from "@/features/telegram/use-cases/collect-asset-value";
import {
  confirmWizard,
  type ConfirmWizardResult,
} from "@/features/telegram/use-cases/confirm-wizard";
import { linkTelegramAccount } from "@/features/telegram/use-cases/link-telegram-account";
import { loadActiveWizardState } from "@/features/telegram/use-cases/load-active-wizard-state";
import { pickTemplate } from "@/features/telegram/use-cases/pick-template";
import {
  resolveTelegramIdentity,
  type TelegramIdentity,
} from "@/features/telegram/use-cases/resolve-telegram-identity";
import { setDeliveryChoice } from "@/features/telegram/use-cases/set-delivery-choice";
import { setTrackCount } from "@/features/telegram/use-cases/set-track-count";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";
import { extractIncomingAssetValue } from "@/features/telegram/bot/incoming";
import * as kb from "@/features/telegram/bot/keyboards";
import * as msg from "@/features/telegram/bot/messages";

/**
 * The Telegram adapter (docs/integrations/telegram.md, ADR-0035–0038).
 * Every handler below follows the same five steps (Phase 8 brief §3):
 * receive update → identify Telegram user → resolve application identity →
 * validate the interaction → invoke an application service → format a
 * reply. No handler contains a business rule of its own — every check that
 * matters (department scope, Template/Job state, authorization) happens
 * inside the use case it calls, identically to the dashboard's own Server
 * Actions calling the same use cases (Phase 8 brief §66).
 *
 * A `Composer<Context>` rather than the bot instance directly, so
 * `features/telegram/bot/register.ts` can attach it to the real bot exactly
 * once (Phase 8 brief §40) — this module never touches `getTelegramBot()`
 * itself.
 */
export const telegramComposer = new Composer<Context>();

function telegramUserIdOf(ctx: Context): string | null {
  const id = ctx.from?.id;
  return id !== undefined ? String(id) : null;
}

/** Every error surfaced to a Telegram user is an `AppError.message` — never
 * a stack trace, a raw Prisma error, or an internal detail (Phase 8 brief
 * §36). Anything that isn't an `AppError` is logged and shown a generic
 * message instead. */
async function replyError(ctx: Context, error: unknown): Promise<void> {
  if (AppError.isAppError(error)) {
    await ctx.reply(`${msg.genericErrorPrefix}${error.message}`);
    return;
  }
  logger.error("Unexpected error in the Telegram adapter", { cause: error });
  await ctx.reply(
    `${msg.genericErrorPrefix}Something went wrong. Please try again.`,
  );
}

/** Resolves the caller's `Actor`, or replies with the auth prompt and
 * returns `null`. Every handler that needs an authorized actor starts here. */
async function requireIdentity(ctx: Context): Promise<TelegramIdentity | null> {
  const telegramUserId = telegramUserIdOf(ctx);
  if (!telegramUserId) return null;
  const identity = await resolveTelegramIdentity(telegramUserId);
  if (!identity) {
    await ctx.reply(msg.notLinkedMessage, kb.authKeyboard());
    return null;
  }
  return identity;
}

async function sendConfirmSummary(
  ctx: Context,
  payload: WizardPayload,
): Promise<void> {
  await ctx.reply(
    msg.confirmSummaryMessage(
      payload.templateName,
      payload.trackCount,
      payload.deliverToYouTube,
    ),
    kb.confirmKeyboard(),
  );
}

async function reportConfirmResult(
  ctx: Context,
  result: ConfirmWizardResult,
): Promise<void> {
  if (result.outcome === "cancelled") {
    await ctx.reply(msg.wizardCancelledMessage, kb.mainMenuKeyboard());
    return;
  }
  if (result.outcome === "already_processing") {
    await ctx.reply(msg.alreadyProcessingMessage);
    return;
  }
  await ctx.reply(msg.jobsCreatedMessage(result), kb.mainMenuKeyboard());
}

// ---------------------------------------------------------------------------
// Onboarding & linking
// ---------------------------------------------------------------------------

telegramComposer.start(async (ctx) => {
  const telegramUserId = telegramUserIdOf(ctx);
  if (!telegramUserId) return;
  const identity = await resolveTelegramIdentity(telegramUserId);
  if (identity) {
    await ctx.reply(
      msg.welcomeBackMessage(identity.fullName),
      kb.mainMenuKeyboard(),
    );
  } else {
    await ctx.reply(msg.notLinkedMessage, kb.authKeyboard());
  }
});

telegramComposer.help(async (ctx) => {
  await ctx.reply(
    "Use the menu below to create, list, retry, or cancel jobs. /cancel resets an in-progress conversation.",
  );
});

telegramComposer.command("cancel", async (ctx) => {
  const telegramUserId = telegramUserIdOf(ctx);
  if (!telegramUserId) return;
  await cancelWizard(telegramUserId);
  await ctx.reply(msg.wizardCancelledMessage, kb.mainMenuKeyboard());
});

telegramComposer.on("contact", async (ctx) => {
  const telegramUserId = telegramUserIdOf(ctx);
  const message = ctx.message;
  if (!telegramUserId || !message || !("contact" in message)) return;

  // Only a self-shared contact proves the sender's own phone number — a
  // forwarded contact card for someone else must never be treated as this
  // user's own identity claim.
  if (
    message.contact.user_id !== undefined &&
    String(message.contact.user_id) !== telegramUserId
  ) {
    await ctx.reply(msg.linkFailedMessage, kb.authKeyboard());
    return;
  }

  const result = await linkTelegramAccount(
    telegramUserId,
    message.contact.phone_number,
  );
  if (result.linked) {
    await ctx.reply(msg.linkSuccessMessage, kb.mainMenuKeyboard());
  } else {
    await ctx.reply(msg.linkFailedMessage, kb.authKeyboard());
  }
});

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

telegramComposer.hears(kb.MAIN_MENU_LABELS.singleTrack, async (ctx) => {
  const identity = await requireIdentity(ctx);
  if (!identity) return;
  const templates = await listDepartmentTemplates(identity.actor, {
    status: "ACTIVE",
    page: 1,
    pageSize: 25,
  });
  if (templates.items.length === 0) {
    await ctx.reply(msg.noTemplatesMessage);
    return;
  }
  await ctx.reply(
    msg.pickTemplateMessage("single"),
    kb.templatePickerKeyboard(templates.items, "SINGLE_TRACK"),
  );
});

telegramComposer.hears(kb.MAIN_MENU_LABELS.album, async (ctx) => {
  const identity = await requireIdentity(ctx);
  if (!identity) return;
  const templates = await listDepartmentTemplates(identity.actor, {
    status: "ACTIVE",
    page: 1,
    pageSize: 25,
  });
  if (templates.items.length === 0) {
    await ctx.reply(msg.noTemplatesMessage);
    return;
  }
  await ctx.reply(
    msg.pickTemplateMessage("album"),
    kb.templatePickerKeyboard(templates.items, "ALBUM"),
  );
});

telegramComposer.hears(kb.MAIN_MENU_LABELS.listJobs, async (ctx) => {
  const identity = await requireIdentity(ctx);
  if (!identity) return;
  const jobs = await listDepartmentJobs(identity.actor, {
    page: 1,
    pageSize: 10,
  });
  if (jobs.items.length === 0) {
    await ctx.reply(msg.noRecentJobsMessage());
    return;
  }
  await ctx.reply(msg.recentJobsHeading(), kb.jobListKeyboard(jobs.items));
});

telegramComposer.hears(kb.MAIN_MENU_LABELS.cancelAll, async (ctx) => {
  const identity = await requireIdentity(ctx);
  if (!identity) return;
  const result = await cancelAllJobsForTelegram(identity.actor);
  await ctx.reply(msg.cancelAllResultMessage(result));
});

// ---------------------------------------------------------------------------
// Inline callback actions (Phase 8 brief §19 — every id re-validated
// server-side by the use case it reaches; nothing here trusts the callback
// data beyond its shape)
// ---------------------------------------------------------------------------

telegramComposer.on("callback_query", async (ctx) => {
  const data =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? ctx.callbackQuery.data
      : undefined;
  const action = data ? decodeCallbackData(data) : null;
  if (!action) {
    await ctx.answerCbQuery();
    return;
  }

  const telegramUserId = telegramUserIdOf(ctx);
  if (!telegramUserId) {
    await ctx.answerCbQuery();
    return;
  }

  try {
    switch (action.kind) {
      case "pick_template": {
        const identity = await resolveTelegramIdentity(telegramUserId);
        if (!identity) {
          await ctx.answerCbQuery(msg.unlinkedActionMessage, {
            show_alert: true,
          });
          return;
        }
        const result = await pickTemplate(
          identity.actor,
          telegramUserId,
          ctx.update.update_id,
          action.flow,
          action.templateId,
        );
        await ctx.answerCbQuery();
        if (result.step === "ASK_DELIVERY") {
          await ctx.reply(msg.askDeliveryMessage, kb.deliveryChoiceKeyboard());
        } else {
          await ctx.reply(msg.askTrackCountMessage);
        }
        return;
      }

      case "delivery_choice": {
        const identity = await resolveTelegramIdentity(telegramUserId);
        if (!identity) {
          await ctx.answerCbQuery(msg.unlinkedActionMessage, {
            show_alert: true,
          });
          return;
        }
        const state = await loadActiveWizardState(telegramUserId);
        if (!state || state.step !== "ASK_DELIVERY") {
          await ctx.answerCbQuery();
          await ctx.reply(msg.sessionExpiredMessage, kb.mainMenuKeyboard());
          return;
        }
        const result = await setDeliveryChoice(
          telegramUserId,
          ctx.update.update_id,
          state.payload,
          action.deliver,
        );
        await ctx.answerCbQuery();
        if (result.step === "CONFIRM") {
          await sendConfirmSummary(ctx, result.payload);
        } else {
          const nextSlot = result.payload.slots[0];
          if (nextSlot) await ctx.reply(msg.askSlotMessage(nextSlot));
        }
        return;
      }

      case "confirm_creation": {
        const identity = await resolveTelegramIdentity(telegramUserId);
        if (!identity) {
          await ctx.answerCbQuery(msg.unlinkedActionMessage, {
            show_alert: true,
          });
          return;
        }
        const state = await loadActiveWizardState(telegramUserId);
        if (!state || state.step !== "CONFIRM") {
          await ctx.answerCbQuery();
          await ctx.reply(msg.sessionExpiredMessage, kb.mainMenuKeyboard());
          return;
        }
        await ctx.answerCbQuery();
        const result = await confirmWizard(
          identity.actor,
          telegramUserId,
          ctx.update.update_id,
          state.payload,
          action.confirmed,
        );
        await reportConfirmResult(ctx, result);
        return;
      }

      case "job_detail": {
        const identity = await resolveTelegramIdentity(telegramUserId);
        if (!identity) {
          await ctx.answerCbQuery(msg.unlinkedActionMessage, {
            show_alert: true,
          });
          return;
        }
        const job = await getJob(identity.actor, action.jobId);
        await ctx.answerCbQuery();
        await ctx.reply(msg.jobDetailMessage(job), kb.jobDetailKeyboard(job));
        return;
      }

      case "job_retry": {
        const identity = await resolveTelegramIdentity(telegramUserId);
        if (!identity) {
          await ctx.answerCbQuery(msg.unlinkedActionMessage, {
            show_alert: true,
          });
          return;
        }
        await retryJob(identity.actor, action.jobId);
        await ctx.answerCbQuery();
        await ctx.reply(msg.jobRetriedMessage);
        return;
      }

      case "job_cancel": {
        const identity = await resolveTelegramIdentity(telegramUserId);
        if (!identity) {
          await ctx.answerCbQuery(msg.unlinkedActionMessage, {
            show_alert: true,
          });
          return;
        }
        await cancelJob(identity.actor, action.jobId);
        await ctx.answerCbQuery();
        await ctx.reply(msg.jobCanceledMessage);
        return;
      }
    }
  } catch (error) {
    await ctx.answerCbQuery();
    await replyError(ctx, error);
  }
});

// ---------------------------------------------------------------------------
// Asset collection (text / photo / audio / video / document) — must be
// registered LAST so it never shadows the specific handlers above (commands,
// contact share, exact main-menu text).
// ---------------------------------------------------------------------------

telegramComposer.on(
  ["text", "photo", "audio", "video", "document"],
  async (ctx) => {
    const telegramUserId = telegramUserIdOf(ctx);
    if (!telegramUserId) return;

    const identity = await resolveTelegramIdentity(telegramUserId);
    if (!identity) {
      await ctx.reply(msg.notLinkedMessage, kb.authKeyboard());
      return;
    }

    const state = await loadActiveWizardState(telegramUserId);
    if (!state) {
      await ctx.reply(msg.unknownInputMessage, kb.mainMenuKeyboard());
      return;
    }

    try {
      if (state.step === "ASK_TRACK_COUNT") {
        const message = ctx.message;
        const text = message && "text" in message ? message.text : undefined;
        if (!text) {
          await ctx.reply(msg.askTrackCountMessage);
          return;
        }
        const result = await setTrackCount(
          telegramUserId,
          ctx.update.update_id,
          state.payload,
          text,
        );
        if (result.step === "CONFIRM") {
          await sendConfirmSummary(ctx, result.payload);
        } else {
          const nextSlot = result.payload.slots[0];
          if (nextSlot) await ctx.reply(msg.askSlotMessage(nextSlot));
        }
        return;
      }

      if (state.step === "COLLECT_ASSETS") {
        const incoming = await extractIncomingAssetValue(ctx);
        if (!incoming) return;
        const result = await collectAssetValue(
          identity.actor,
          telegramUserId,
          ctx.update.update_id,
          state.payload,
          incoming,
        );
        if (result.outcome === "confirm_ready") {
          await sendConfirmSummary(ctx, result.payload);
        } else if (result.nextSlot) {
          await ctx.reply(msg.askSlotMessage(result.nextSlot));
        }
        return;
      }

      // PICK_TEMPLATE / ASK_DELIVERY / CONFIRM expect a button tap, not a
      // plain message; CREATING/COMPLETED are transient/terminal. A stray
      // message in any of these just gets nudged back, never silently eaten.
      await ctx.reply(msg.unknownInputMessage);
    } catch (error) {
      await replyError(ctx, error);
    }
  },
);
