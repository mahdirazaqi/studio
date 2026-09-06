import type { Context } from "telegraf";

import { dependencyError, validationError } from "@/server/errors/app-error";
import type { IncomingAssetValue } from "@/features/telegram/use-cases/collect-asset-value";

/**
 * Turns one Telegram message into the transport-neutral
 * `IncomingAssetValue` the use-case layer expects (Phase 8 brief §23: only
 * the media types the actual workflow needs — photo, audio, video, document,
 * and plain text; nothing else is accepted). Downloads media bytes over
 * plain HTTP via the Bot API's own file link — never trusts a Telegram-
 * declared filename for anything beyond a display-only suggestion, and never
 * guesses a MIME type from a URL extension the way legacy did (the real
 * content type is sniffed from the bytes by `features/files/use-cases/
 * upload-file.ts`, not decided here).
 */
export async function extractIncomingAssetValue(
  ctx: Context,
): Promise<IncomingAssetValue | null> {
  const message = ctx.message;
  if (!message) return null;

  if ("text" in message && message.text) {
    return { kind: "text", text: message.text };
  }

  if ("photo" in message && message.photo.length > 0) {
    // Telegram sends the same photo at several resolutions; the last entry
    // is the largest.
    const largest = message.photo[message.photo.length - 1];
    if (!largest) return null;
    const file = await downloadTelegramFile(ctx, largest.file_id, "photo.jpg");
    return { kind: "file", file };
  }

  if ("audio" in message) {
    const name = message.audio.file_name ?? "audio.mp3";
    const file = await downloadTelegramFile(ctx, message.audio.file_id, name);
    return { kind: "file", file };
  }

  if ("video" in message) {
    const name = message.video.file_name ?? "video.mp4";
    const file = await downloadTelegramFile(ctx, message.video.file_id, name);
    return { kind: "file", file };
  }

  if ("document" in message) {
    const name = message.document.file_name ?? "document";
    const file = await downloadTelegramFile(
      ctx,
      message.document.file_id,
      name,
    );
    return { kind: "file", file };
  }

  throw validationError(
    "That message type isn't supported here. Please send text, a photo, an audio file, or a video.",
  );
}

async function downloadTelegramFile(
  ctx: Context,
  fileId: string,
  suggestedName: string,
): Promise<File> {
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(link.toString());
  if (!response.ok) {
    throw dependencyError(
      "Could not download that file from Telegram. Please try again.",
    );
  }
  const bytes = await response.arrayBuffer();
  return new File([bytes], suggestedName);
}
