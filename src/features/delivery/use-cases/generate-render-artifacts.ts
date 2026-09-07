import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dependencyError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { storage } from "@/server/adapters/storage";
import {
  extractVideoFrame,
  resizeImageToHeight,
} from "@/server/adapters/media/ffmpeg-adapter";
import { createJobArtifactFile } from "@/features/files/use-cases/create-job-artifact";
import {
  deleteFileRow,
  findStorageKey,
} from "@/features/files/repository/file-repository";
import type { SafeFile } from "@/features/files/domain/file";

/**
 * `MediaProcessingService` (docs/domain/jobs.md "Rendered result", Phase 9,
 * ADR-0039): turns a rendered video buffer into the three `JOB_ARTIFACT`
 * Files a Job needs — the video itself, a screenshot (fixed offset, legacy:
 * `00:00:04.000`), and a small resized thumbnail (legacy: ImageMagick
 * `-resize x150`, done here via `ffmpeg`'s `scale` filter instead — see
 * `ffmpeg-adapter.ts`'s doc comment for why a second native dependency was
 * not introduced). All three exist for the dashboard's own Job detail view
 * (preview/download the rendered result) — independent of any external
 * delivery destination, which Studio no longer has (ADR-0041).
 *
 * All filesystem work happens in a private, per-call temp directory
 * (`mkdtemp` — never a predictable/shared path) that is always removed in
 * `finally`, so a mid-way failure never leaks scratch files onto disk.
 * `extractVideoFrame` is retried once at timestamp `0` if the first attempt
 * (a fixed 4-second offset, matching legacy) fails — a render shorter than 4
 * seconds must not make the whole result rejected just because there is no
 * frame at that offset.
 */
export interface RenderArtifacts {
  video: SafeFile;
  screenshot: SafeFile;
  thumbnail: SafeFile;
}

const SCREENSHOT_TIMESTAMP_SECONDS = 4;
const THUMBNAIL_HEIGHT_PX = 150;

/** Exposed for `accept-job-result.ts` to roll back a full artifact set when
 * it loses the `RENDERING -> RENDERED` transition race after this already
 * succeeded (docs/domain/jobs.md "Worker claim" — the same "do the work,
 * then atomically try to claim it" shape as `claimNextJobRow`). */
export async function rollbackRenderArtifacts(
  artifacts: RenderArtifacts,
): Promise<void> {
  await Promise.all(
    [artifacts.video, artifacts.screenshot, artifacts.thumbnail].map((file) =>
      rollbackArtifact(file.id),
    ),
  );
}

async function hasContent(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

async function rollbackArtifact(fileId: string): Promise<void> {
  const storageKey = await findStorageKey(fileId);
  await deleteFileRow(fileId).catch((error: unknown) => {
    logger.error(
      "Failed to roll back a partially-created render artifact row",
      {
        fileId,
        cause: error,
      },
    );
  });
  if (storageKey) {
    await storage.delete(storageKey).catch((error: unknown) => {
      logger.error(
        "Failed to roll back a partially-created render artifact's storage object",
        { fileId, storageKey, cause: error },
      );
    });
  }
}

export async function generateRenderArtifacts(
  departmentId: string,
  videoBuffer: Buffer,
): Promise<RenderArtifacts> {
  const workDir = await mkdtemp(join(tmpdir(), "studio-render-"));
  try {
    const videoPath = join(workDir, "video.mp4");
    const screenshotPath = join(workDir, "screenshot.jpg");
    const thumbnailPath = join(workDir, "thumbnail.jpg");

    await writeFile(videoPath, videoBuffer);

    try {
      await extractVideoFrame(
        videoPath,
        SCREENSHOT_TIMESTAMP_SECONDS,
        screenshotPath,
      );
      // `ffmpeg -ss <t> -i ...` seeking past a short render's actual duration
      // exits `0` (not an error) but writes nothing — a thrown exception is
      // not the only failure signal here, so the retry must also trigger on
      // "ffmpeg succeeded but produced no file" (manually verified against a
      // real 2-second test render).
      if (!(await hasContent(screenshotPath))) {
        throw new Error(
          "ffmpeg produced no output (render shorter than the seek offset?)",
        );
      }
    } catch (error) {
      logger.warn(
        "Screenshot at the default timestamp failed; retrying at 0s (short render?)",
        { cause: error },
      );
      await extractVideoFrame(videoPath, 0, screenshotPath);
      if (!(await hasContent(screenshotPath))) {
        throw dependencyError(
          "Could not extract a screenshot from the render result.",
        );
      }
    }

    await resizeImageToHeight(
      screenshotPath,
      thumbnailPath,
      THUMBNAIL_HEIGHT_PX,
    );

    const [screenshotBuffer, thumbnailBuffer] = await Promise.all([
      readFile(screenshotPath),
      readFile(thumbnailPath),
    ]);

    const artifactId = randomUUID();
    // Sequential, not `Promise.all` — on a failure partway through, every
    // File row already committed for *this* result is rolled back (storage
    // bytes + row) rather than left as an orphaned artifact nothing
    // references (mirrors `uploadFile`'s own storage-then-DB cleanup
    // discipline, just across three related writes instead of one).
    const created: SafeFile[] = [];
    try {
      const video = await createJobArtifactFile({
        departmentId,
        originalName: `render-${artifactId}.mp4`,
        buffer: videoBuffer,
      });
      created.push(video);

      const screenshot = await createJobArtifactFile({
        departmentId,
        originalName: `screenshot-${artifactId}.jpg`,
        buffer: screenshotBuffer,
      });
      created.push(screenshot);

      const thumbnail = await createJobArtifactFile({
        departmentId,
        originalName: `thumbnail-${artifactId}.jpg`,
        buffer: thumbnailBuffer,
      });
      created.push(thumbnail);

      return { video, screenshot, thumbnail };
    } catch (error) {
      await Promise.all(created.map((file) => rollbackArtifact(file.id)));
      throw error;
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(
      (error: unknown) => {
        logger.warn("Failed to remove render-artifact temp directory", {
          workDir,
          cause: error,
        });
      },
    );
  }
}
