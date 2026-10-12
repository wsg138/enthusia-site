import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  logValidationSummary,
  summarizeValidationIssues,
} from "../src/validation-diagnostics";

describe("safe validation diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports structure without field values", () => {
    const privateValue = "private-owner-value";
    const data = { stalls: [{ stall: { ownerSince: privateValue } }] };
    const schema = z.object({
      stalls: z.array(z.object({ stall: z.object({ ownerSince: z.iso.datetime({ offset: true }) }) })),
    });
    const result = schema.safeParse(data);
    expect(result.success).toBe(false);
    if (result.success) return;

    const summary = summarizeValidationIssues(result.error.issues, data);
    expect(summary).toEqual({
      category: "invalid_field",
      issues: [{
        code: "invalid_format",
        path: "stalls[0].stall.ownerSince",
        expected: "datetime",
        received: "string",
        length: privateValue.length,
      }],
      omitted: 0,
    });
    expect(JSON.stringify(summary)).not.toContain(privateValue);
  });

  it("redacts unknown property names and caps issue count", () => {
    const data = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`private-${index}`, index]));
    const result = z.object({}).strict().safeParse(data);
    expect(result.success).toBe(false);
    if (result.success) return;

    const summary = summarizeValidationIssues(Array(25).fill(result.error.issues[0]), data);
    expect(summary.issues).toHaveLength(20);
    expect(summary.omitted).toBe(5);
    expect(JSON.stringify(summary)).not.toContain("private-");
  });

  it("does not read inherited fields", () => {
    const data = Object.create({ ownerSince: "inherited-private-value" });
    const summary = summarizeValidationIssues([{
      code: "custom",
      path: ["ownerSince"],
      message: "invalid owner date",
    }], data);

    expect(summary.issues[0]).toEqual({
      code: "custom",
      path: "ownerSince",
      expected: "constraint",
      received: "undefined",
    });
    expect(JSON.stringify(summary)).not.toContain("inherited-private-value");
  });

  it("only uses numeric path segments for array indexes", () => {
    const data = { stalls: { 0: { stall: { ownerSince: "private-value" } } } };
    const summary = summarizeValidationIssues([{
      code: "custom",
      path: ["stalls", 0, "stall", "ownerSince"],
      message: "invalid owner date",
    }], data);

    expect(summary.issues[0]).toMatchObject({ received: "undefined" });
    expect(JSON.stringify(summary)).not.toContain("private-value");
  });

  it("redacts symbol path segments without reading their values", () => {
    const privateKey = Symbol("private-path");
    const data = { [privateKey]: "private-value" };
    const summary = summarizeValidationIssues([{
      code: "custom",
      path: [privateKey],
      message: "invalid private field",
    }], data);

    expect(summary.issues[0]).toEqual({
      code: "custom",
      path: "field",
      expected: "constraint",
      received: "undefined",
    });
    expect(JSON.stringify(summary)).not.toContain("private-value");
  });

  it("emits one bounded log entry inside the rate-limit window", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const summary = { category: "invalid_field" as const, issues: [], omitted: 0 };
    logValidationSummary("/internal/v1/full-sync", summary, 40_000);
    logValidationSummary("/internal/v1/full-sync", summary, 40_001);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("authenticated_market_validation_rejected");
  });
});
