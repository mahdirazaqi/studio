import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { env } from "@/server/env";
import { dependencyError } from "@/server/errors/app-error";

const execFileAsync = promisify(execFile);

/**
 * The only module that shells out to `ffmpeg` (docs/security/security.md §6,
 * ADR-0039). Every call goes through `execFile` with a fixed argument array —
 * never `exec`, never a template-built command string, never `shell: true`.
 * Every path here is an internally-generated temp-file path
 * (`accept-job-result.ts`), never a client-supplied filename — see
 * `docs/security/security.md` "File path security."
 *
 * `MediaProcessingService` (`features/delivery/use-cases/
 * generate-render-artifacts.ts`) is the only caller — nothing else imports
 * this module directly, mirroring how `@/server/adapters/storage` is the only
 * place `node:fs` is touched for File bytes.
 */

async function runFfmpeg(args: readonly string[]): Promise<void> {
  try {
    await execFileAsync(env.FFMPEG_PATH, [...args], {
      // Generous but bounded — a wedged ffmpeg process must not hang a
      // Worker's result-upload request forever.
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw dependencyError(
      "Media processing failed while handling the render result.",
      {
        cause: error,
      },
    );
  }
}

/**
 * Extract a single frame from `videoPath` at `timestampSeconds` into a JPEG
 * at `outputPath` (legacy: `ffmpeg().screenshots({ timestamps: ['00:00:04.000'] })`).
 * `-ss` before `-i` seeks quickly rather than decoding from the start.
 */
export async function extractVideoFrame(
  videoPath: string,
  timestampSeconds: number,
  outputPath: string,
): Promise<void> {
  await runFfmpeg([
    "-y",
    "-ss",
    String(Math.max(0, timestampSeconds)),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath,
  ]);
}

/**
 * Resize an image to a fixed height, preserving aspect ratio (legacy:
 * ImageMagick `convert -resize x150`). Kept on `ffmpeg` rather than adding a
 * second native dependency (ImageMagick/`convert`) — `ffmpeg`'s `scale`
 * filter covers this exact need, and Studio already requires `ffmpeg` for the
 * screenshot step above; see ADR-0039 for why ImageMagick was deliberately
 * not migrated. `-2` keeps width even (required by several codecs/filters).
 */
export async function resizeImageToHeight(
  inputPath: string,
  outputPath: string,
  height: number,
): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vf",
    `scale=-2:${height}`,
    outputPath,
  ]);
}
