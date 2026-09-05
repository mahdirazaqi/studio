import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError } from "@/server/errors/app-error";

import { commonSchemas, parseInput, safeParseInput } from "./index";

const schema = z.object({
  title: z.string().min(3),
  count: z.number().int().positive(),
});

describe("parseInput", () => {
  it("returns typed data on success", () => {
    const result = parseInput(schema, { title: "hello", count: 2 });
    expect(result).toEqual({ title: "hello", count: 2 });
  });

  it("throws a validation AppError with field errors on failure", () => {
    try {
      parseInput(schema, { title: "x", count: -1 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(AppError.isAppError(error)).toBe(true);
      const appError = error as AppError;
      expect(appError.kind).toBe("validation");
      expect(appError.httpStatus).toBe(422);
      expect(Object.keys(appError.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(["title", "count"]),
      );
    }
  });
});

describe("safeParseInput", () => {
  it("returns ok:true with data on success", () => {
    expect(safeParseInput(schema, { title: "abcd", count: 1 })).toEqual({
      ok: true,
      data: { title: "abcd", count: 1 },
    });
  });

  it("returns ok:false with field errors on failure", () => {
    const result = safeParseInput(schema, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toHaveProperty("title");
    }
  });
});

describe("commonSchemas", () => {
  it("trims and rejects empty short text", () => {
    expect(commonSchemas.shortText.parse("  hi  ")).toBe("hi");
    expect(commonSchemas.shortText.safeParse("   ").success).toBe(false);
  });

  it("coerces and defaults pagination", () => {
    expect(commonSchemas.page.parse(undefined)).toBe(1);
    expect(commonSchemas.pageSize.parse("50")).toBe(50);
    expect(commonSchemas.pageSize.safeParse(1000).success).toBe(false);
  });
});
