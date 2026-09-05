import { describe, expect, it } from "vitest";

import {
  AppError,
  forbiddenError,
  internalError,
  notFoundError,
  validationError,
} from "./app-error";

describe("AppError", () => {
  it("maps kind to the right HTTP status", () => {
    expect(notFoundError().httpStatus).toBe(404);
    expect(forbiddenError().httpStatus).toBe(403);
    expect(validationError().httpStatus).toBe(422);
    expect(internalError().httpStatus).toBe(500);
  });

  it("exposes non-internal errors and hides internal ones", () => {
    expect(notFoundError().expose).toBe(true);
    expect(internalError().expose).toBe(false);
  });

  it("defaults the code to the kind but allows an override", () => {
    expect(notFoundError().code).toBe("not_found");
    expect(notFoundError("nope", { code: "job.not_found" }).code).toBe(
      "job.not_found",
    );
  });

  it("carries field errors for validation failures", () => {
    const err = validationError("bad", {
      fieldErrors: { name: ["Required"] },
    });
    expect(err.fieldErrors).toEqual({ name: ["Required"] });
  });

  it("keeps the cause for logging without exposing it", () => {
    const cause = new Error("db exploded");
    const err = internalError("generic", { cause });
    expect(err.cause).toBe(cause);
  });

  it("isAppError narrows correctly", () => {
    expect(AppError.isAppError(notFoundError())).toBe(true);
    expect(AppError.isAppError(new Error("x"))).toBe(false);
    expect(AppError.isAppError("x")).toBe(false);
  });
});
