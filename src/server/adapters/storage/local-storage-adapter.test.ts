import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testDir: string;

vi.mock("@/server/env", () => ({
  get env() {
    return { STORAGE_LOCAL_DIR: testDir };
  },
}));

const { LocalStorageAdapter } = await import("./local-storage-adapter");

function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

beforeEach(async () => {
  testDir = await mkdtemp(path.join(tmpdir(), "studio-storage-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("LocalStorageAdapter", () => {
  it("writes and reads back the same bytes", async () => {
    const adapter = new LocalStorageAdapter();
    const data = Buffer.from("hello world");
    await adapter.put("dept-a/some-file.txt", data);

    const readBack = await readAll(adapter.readStream("dept-a/some-file.txt"));
    expect(readBack.toString()).toBe("hello world");
  });

  it("creates nested directories as needed", async () => {
    const adapter = new LocalStorageAdapter();
    await expect(
      adapter.put("dept-a/nested/deeper/file.bin", Buffer.from("x")),
    ).resolves.toBeUndefined();
  });

  it("reports size via stat, and null for a missing object", async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.put("dept-a/sized.bin", Buffer.from("12345"));

    await expect(adapter.stat("dept-a/sized.bin")).resolves.toEqual({
      sizeBytes: 5,
    });
    await expect(adapter.stat("dept-a/never-written.bin")).resolves.toBeNull();
  });

  it("delete is idempotent — resolves even for a nonexistent key", async () => {
    const adapter = new LocalStorageAdapter();
    await expect(
      adapter.delete("dept-a/never-existed.bin"),
    ).resolves.toBeUndefined();
  });

  it("a deleted object no longer stats", async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.put("dept-a/temp.bin", Buffer.from("bye"));
    await adapter.delete("dept-a/temp.bin");
    await expect(adapter.stat("dept-a/temp.bin")).resolves.toBeNull();
  });

  it("supports a byte range read", async () => {
    const adapter = new LocalStorageAdapter();
    await adapter.put("dept-a/range.bin", Buffer.from("0123456789"));

    const readBack = await readAll(
      adapter.readStream("dept-a/range.bin", { start: 2, end: 5 }),
    );
    expect(readBack.toString()).toBe("2345");
  });

  it("refuses to resolve a key that would escape the storage root", async () => {
    const adapter = new LocalStorageAdapter();
    await expect(
      adapter.put("../../etc/passwd", Buffer.from("x")),
    ).rejects.toThrow(/outside its root/);
  });
});
