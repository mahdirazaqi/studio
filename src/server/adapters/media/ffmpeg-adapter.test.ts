import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn(
  (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (
      error: Error | null,
      result: { stdout: string; stderr: string },
    ) => void,
  ) => {
    callback(null, { stdout: "", stderr: "" });
  },
);

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) =>
    (execFileMock as unknown as (...a: unknown[]) => void)(...args),
}));

const { extractVideoFrame, resizeImageToHeight } =
  await import("./ffmpeg-adapter");

beforeEach(() => {
  execFileMock.mockClear();
});

/**
 * Security-critical (docs/security/security.md §6): ffmpeg must always be
 * invoked via an argument array through `execFile` — never a template-built
 * shell string, and never with `shell: true`. These tests assert the actual
 * call shape rather than trusting the implementation's own comment.
 */
describe("ffmpeg-adapter", () => {
  it("extractVideoFrame calls execFile with an argument array, not an interpolated string", async () => {
    await extractVideoFrame("/tmp/in.mp4", 4, "/tmp/out.jpg");

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [command, args, options] = execFileMock.mock.calls[0]!;
    expect(typeof command).toBe("string");
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual([
      "-y",
      "-ss",
      "4",
      "-i",
      "/tmp/in.mp4",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "/tmp/out.jpg",
    ]);
    // No shell option — `execFile` never spawns a shell by default, and this
    // must never be overridden to opt back into one (Security Requirements §6).
    expect(
      (options as Record<string, unknown> | undefined)?.shell,
    ).toBeUndefined();
  });

  it("resizeImageToHeight calls execFile with an argument array", async () => {
    await resizeImageToHeight("/tmp/in.jpg", "/tmp/out.jpg", 150);
    const [, args] = execFileMock.mock.calls[0]!;
    expect(args).toEqual([
      "-y",
      "-i",
      "/tmp/in.jpg",
      "-vf",
      "scale=-2:150",
      "/tmp/out.jpg",
    ]);
  });

  it("never lets a path value leak shell metacharacters into a command string (no string concatenation exists to exploit)", async () => {
    const maliciousPath = "/tmp/evil; rm -rf / #.mp4";
    await extractVideoFrame(maliciousPath, 0, "/tmp/out.jpg");
    const [, args] = execFileMock.mock.calls[0]!;
    // The malicious string is passed as a single, inert argument — `execFile`
    // never interprets it as shell syntax because there is no shell involved.
    expect(args).toContain(maliciousPath);
  });

  it("wraps an ffmpeg failure as a safe dependency error", async () => {
    execFileMock.mockImplementationOnce((_f, _a, _o, callback) => {
      callback(new Error("ffmpeg: command failed"), { stdout: "", stderr: "" });
    });
    await expect(
      extractVideoFrame("/tmp/in.mp4", 4, "/tmp/out.jpg"),
    ).rejects.toMatchObject({ kind: "dependency" });
  });
});
