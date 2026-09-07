import { describe, expect, it } from "vitest";

import {
  decodeCallbackData,
  encodeConfirmCreation,
  encodeJobCancel,
  encodeJobDetail,
  encodeJobRetry,
  encodePickTemplate,
} from "./callback-data";

describe("callback-data encode/decode", () => {
  it("round-trips a Single Track template pick", () => {
    const data = encodePickTemplate("SINGLE_TRACK", "tpl-123");
    expect(decodeCallbackData(data)).toEqual({
      kind: "pick_template",
      flow: "SINGLE_TRACK",
      templateId: "tpl-123",
    });
  });

  it("round-trips an Album template pick, distinct from Single Track", () => {
    const data = encodePickTemplate("ALBUM", "tpl-123");
    expect(decodeCallbackData(data)).toEqual({
      kind: "pick_template",
      flow: "ALBUM",
      templateId: "tpl-123",
    });
  });

  it("round-trips confirm/cancel", () => {
    expect(decodeCallbackData(encodeConfirmCreation(true))).toEqual({
      kind: "confirm_creation",
      confirmed: true,
    });
    expect(decodeCallbackData(encodeConfirmCreation(false))).toEqual({
      kind: "confirm_creation",
      confirmed: false,
    });
  });

  it("round-trips job detail/retry/cancel", () => {
    expect(decodeCallbackData(encodeJobDetail("job-1"))).toEqual({
      kind: "job_detail",
      jobId: "job-1",
    });
    expect(decodeCallbackData(encodeJobRetry("job-1"))).toEqual({
      kind: "job_retry",
      jobId: "job-1",
    });
    expect(decodeCallbackData(encodeJobCancel("job-1"))).toEqual({
      kind: "job_cancel",
      jobId: "job-1",
    });
  });

  it("returns null for unrecognized data", () => {
    expect(decodeCallbackData("garbage")).toBeNull();
    expect(decodeCallbackData("")).toBeNull();
  });

  it("returns null for a prefix with no id (stale/tampered callback)", () => {
    expect(decodeCallbackData("tpl:s:")).toBeNull();
    expect(decodeCallbackData("job:d:")).toBeNull();
  });

  it("never confuses one action's prefix for another's", () => {
    // "job:r:" (retry) must not be mistaken for "job:d:" (detail) or vice
    // versa — each decodes to exactly its own kind.
    expect(decodeCallbackData(encodeJobRetry("x"))?.kind).toBe("job_retry");
    expect(decodeCallbackData(encodeJobCancel("x"))?.kind).toBe("job_cancel");
    expect(decodeCallbackData(encodeJobDetail("x"))?.kind).toBe("job_detail");
  });
});
