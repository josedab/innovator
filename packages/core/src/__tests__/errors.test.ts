import { describe, it, expect, vi } from "vitest";

import {
  InnovatorError,
  LlmError,
  LlmTimeoutError,
  LlmParseError,
  RateLimitError,
  ValidationError,
  PipelineError,
  ConfigurationError,
  AbortError,
  AggregateInnovatorError,
  isInnovatorError,
  fromZodError,
} from "../errors.js";
import { RetryExhaustedError } from "../copilot/retry.js";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

describe("errors", () => {
  describe("InnovatorError", () => {
    it("has correct name, code, and message", () => {
      const err = new InnovatorError("something broke");
      expect(err.name).toBe("InnovatorError");
      expect(err.code).toBe("ERR_INNOVATOR");
      expect(err.message).toBe("something broke");
      expect(err).toBeInstanceOf(Error);
    });

    it("supports cause chaining", () => {
      const cause = new Error("root cause");
      const err = new InnovatorError("wrapped", "ERR_INNOVATOR", cause);
      expect(err.cause).toBe(cause);
    });

    it("serializes to JSON with toJSON()", () => {
      const err = new InnovatorError("test error", "ERR_INNOVATOR");
      const json = err.toJSON();
      expect(json).toEqual({
        name: "InnovatorError",
        code: "ERR_INNOVATOR",
        message: "test error",
      });
    });

    it("includes cause in toJSON() when present", () => {
      const cause = new Error("root cause");
      const err = new InnovatorError("wrapped", "ERR_INNOVATOR", cause);
      const json = err.toJSON();
      expect(json).toEqual({
        name: "InnovatorError",
        code: "ERR_INNOVATOR",
        message: "wrapped",
        cause: "root cause",
      });
    });

    it("works with JSON.stringify()", () => {
      const err = new InnovatorError("stringify test");
      const str = JSON.stringify(err);
      const parsed = JSON.parse(str);
      expect(parsed.code).toBe("ERR_INNOVATOR");
      expect(parsed.message).toBe("stringify test");
    });
  });

  describe("LlmError", () => {
    it("has correct name, code, and model", () => {
      const err = new LlmError("API failed", { model: "gpt-4.1" });
      expect(err.name).toBe("LlmError");
      expect(err.code).toBe("ERR_LLM");
      expect(err.model).toBe("gpt-4.1");
      expect(err).toBeInstanceOf(InnovatorError);
    });
  });

  describe("LlmTimeoutError", () => {
    it("has correct timeout and message", () => {
      const err = new LlmTimeoutError(90000);
      expect(err.name).toBe("LlmTimeoutError");
      expect(err.code).toBe("ERR_LLM_TIMEOUT");
      expect(err.timeoutMs).toBe(90000);
      expect(err.message).toContain("90s");
      expect(err).toBeInstanceOf(LlmError);
    });
  });

  describe("LlmParseError", () => {
    it("truncates long raw output", () => {
      const longOutput = "x".repeat(1000);
      const err = new LlmParseError("parse failed", longOutput);
      expect(err.name).toBe("LlmParseError");
      expect(err.code).toBe("ERR_LLM_PARSE");
      expect(err.rawOutput.length).toBeLessThanOrEqual(501);
      expect(err.rawOutput).toContain("…");
    });

    it("keeps short raw output as-is", () => {
      const err = new LlmParseError("parse failed", "short text");
      expect(err.rawOutput).toBe("short text");
    });
  });

  describe("RateLimitError", () => {
    it("stores retryAfterMs", () => {
      const err = new RateLimitError("rate limited", {
        model: "gpt-4.1",
        retryAfterMs: 5000,
      });
      expect(err.name).toBe("RateLimitError");
      expect(err.code).toBe("ERR_LLM_RATE_LIMIT");
      expect(err.retryAfterMs).toBe(5000);
      expect(err.model).toBe("gpt-4.1");
      expect(err).toBeInstanceOf(LlmError);
    });
  });

  describe("ValidationError", () => {
    it("stores validation issues", () => {
      const issues = [{ path: "title", message: "Required" }];
      const err = new ValidationError("validation failed", { issues });
      expect(err.name).toBe("ValidationError");
      expect(err.code).toBe("ERR_VALIDATION");
      expect(err.issues).toEqual(issues);
      expect(err).toBeInstanceOf(InnovatorError);
    });
  });

  describe("PipelineError", () => {
    it("stores pipeline stage", () => {
      const err = new PipelineError("stage failed", "investigating");
      expect(err.name).toBe("PipelineError");
      expect(err.code).toBe("ERR_PIPELINE");
      expect(err.stage).toBe("investigating");
    });
  });

  describe("ConfigurationError", () => {
    it("stores config key", () => {
      const err = new ConfigurationError("missing key", "INNOVATOR_DEFAULT_MODEL");
      expect(err.name).toBe("ConfigurationError");
      expect(err.code).toBe("ERR_CONFIGURATION");
      expect(err.configKey).toBe("INNOVATOR_DEFAULT_MODEL");
    });
  });

  describe("AbortError", () => {
    it("has correct defaults", () => {
      const err = new AbortError();
      expect(err.name).toBe("AbortError");
      expect(err.code).toBe("ERR_ABORT");
      expect(err.message).toBe("Operation was aborted");
    });

    it("accepts custom message", () => {
      const err = new AbortError("user cancelled");
      expect(err.message).toBe("user cancelled");
    });
  });

  describe("AggregateInnovatorError", () => {
    it("collects multiple errors with default code", () => {
      const errors = [new Error("angle 1 failed"), new Error("angle 2 failed")];
      const err = new AggregateInnovatorError("2 of 8 angles failed", errors);
      expect(err.name).toBe("AggregateInnovatorError");
      expect(err.code).toBe("ERR_PIPELINE");
      expect(err.errors).toHaveLength(2);
      expect(err.message).toBe("2 of 8 angles failed");
      expect(err).toBeInstanceOf(InnovatorError);
    });

    it("supports custom error code", () => {
      const err = new AggregateInnovatorError("validation batch failed", [], "ERR_VALIDATION");
      expect(err.code).toBe("ERR_VALIDATION");
    });

    it("errors array is frozen (immutable)", () => {
      const errors = [new Error("e1")];
      const err = new AggregateInnovatorError("test", errors);
      expect(() => (err.errors as Error[]).push(new Error("e2"))).toThrow();
      expect(err.errors).toHaveLength(1);
    });

    it("serializes to JSON with error details", () => {
      const errors = [
        new LlmError("timeout on gpt-4.1", { model: "gpt-4.1" }),
        new ValidationError("bad schema"),
      ];
      const err = new AggregateInnovatorError("batch failed", errors);
      const json = err.toJSON();
      expect(json.name).toBe("AggregateInnovatorError");
      expect(json.errorCount).toBe(2);
      expect(json.errors).toEqual([
        { name: "LlmError", message: "timeout on gpt-4.1" },
        { name: "ValidationError", message: "bad schema" },
      ]);
    });

    it("is detected by isInnovatorError", () => {
      const err = new AggregateInnovatorError("test", []);
      expect(isInnovatorError(err)).toBe(true);
    });

    it("handles empty errors array", () => {
      const err = new AggregateInnovatorError("no errors collected", []);
      expect(err.errors).toHaveLength(0);
      const json = err.toJSON();
      expect(json.errorCount).toBe(0);
      expect(json.errors).toEqual([]);
    });
  });

  describe("RetryExhaustedError", () => {
    it("extends InnovatorError with ERR_RETRY_EXHAUSTED code", () => {
      const cause = new Error("network failure");
      const err = new RetryExhaustedError(cause, 3);
      expect(err.name).toBe("RetryExhaustedError");
      expect(err.code).toBe("ERR_RETRY_EXHAUSTED");
      expect(err.attempts).toBe(3);
      expect(err.cause).toBe(cause);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err).toBeInstanceOf(Error);
    });

    it("is detected by isInnovatorError type guard", () => {
      const err = new RetryExhaustedError(new Error("fail"), 2);
      expect(isInnovatorError(err)).toBe(true);
    });

    it("serializes to JSON with attempts", () => {
      const err = new RetryExhaustedError(new Error("timeout"), 5);
      const json = err.toJSON();
      expect(json.code).toBe("ERR_RETRY_EXHAUSTED");
      expect(json.attempts).toBe(5);
      expect(json.cause).toBe("timeout");
    });
  });

  describe("isInnovatorError", () => {
    it("returns true for InnovatorError subtypes", () => {
      expect(isInnovatorError(new InnovatorError("test"))).toBe(true);
      expect(isInnovatorError(new LlmError("test"))).toBe(true);
      expect(isInnovatorError(new LlmTimeoutError(1000))).toBe(true);
      expect(isInnovatorError(new AbortError())).toBe(true);
      expect(isInnovatorError(new PipelineError("test", "investigating"))).toBe(true);
      expect(isInnovatorError(new RetryExhaustedError(new Error("x"), 1))).toBe(true);
    });

    it("returns false for non-InnovatorError values", () => {
      expect(isInnovatorError(new Error("plain"))).toBe(false);
      expect(isInnovatorError("string")).toBe(false);
      expect(isInnovatorError(null)).toBe(false);
      expect(isInnovatorError(undefined)).toBe(false);
    });
  });

  describe("fromZodError", () => {
    it("converts Zod-like error to ValidationError with structured issues", () => {
      const zodError = {
        issues: [
          { path: ["summary"], message: "Required" },
          {
            path: ["keyAspects", 0, "title"],
            message: "String must contain at most 500 character(s)",
          },
        ],
      };
      const err = fromZodError(zodError);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.code).toBe("ERR_VALIDATION");
      expect(err.issues).toHaveLength(2);
      expect(err.issues![0]).toEqual({ path: "summary", message: "Required" });
      expect(err.issues![1]).toEqual({
        path: "keyAspects.0.title",
        message: "String must contain at most 500 character(s)",
      });
    });

    it("includes context prefix in error message when provided", () => {
      const zodError = {
        issues: [{ path: ["title"], message: "Required" }],
      };
      const err = fromZodError(zodError, "Invalid investigation");
      expect(err.message).toContain("Invalid investigation");
      expect(err.message).toContain("title: Required");
    });

    it("uses default prefix when no context is provided", () => {
      const zodError = {
        issues: [{ path: [], message: "Invalid input" }],
      };
      const err = fromZodError(zodError);
      expect(err.message).toContain("Validation failed: ");
      expect(err.message).toContain("Invalid input");
    });

    it("truncates message to first 5 issues", () => {
      const zodError = {
        issues: Array.from({ length: 10 }, (_, i) => ({
          path: [`field${i}`],
          message: `Error ${i}`,
        })),
      };
      const err = fromZodError(zodError);
      expect(err.issues).toHaveLength(10);
      // Message only shows first 5
      expect(err.message).toContain("field4");
      expect(err.message).not.toContain("field5");
    });

    it("handles empty path in issues", () => {
      const zodError = {
        issues: [{ path: [], message: "Root-level error" }],
      };
      const err = fromZodError(zodError);
      expect(err.issues![0].path).toBe("");
      expect(err.message).toContain("Root-level error");
    });

    it("serializes correctly via toJSON", () => {
      const zodError = {
        issues: [{ path: ["name"], message: "Too short" }],
      };
      const err = fromZodError(zodError, "Plugin validation");
      const json = err.toJSON();
      expect(json.code).toBe("ERR_VALIDATION");
      expect(json.issues).toEqual([{ path: "name", message: "Too short" }]);
    });
  });

  describe("inheritance chain", () => {
    it("LlmTimeoutError is instanceof LlmError and InnovatorError", () => {
      const err = new LlmTimeoutError(1000);
      expect(err).toBeInstanceOf(LlmTimeoutError);
      expect(err).toBeInstanceOf(LlmError);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err).toBeInstanceOf(Error);
    });

    it("LlmParseError is instanceof LlmError and InnovatorError", () => {
      const err = new LlmParseError("bad json", "raw");
      expect(err).toBeInstanceOf(LlmParseError);
      expect(err).toBeInstanceOf(LlmError);
      expect(err).toBeInstanceOf(InnovatorError);
    });

    it("RetryExhaustedError is instanceof InnovatorError", () => {
      const err = new RetryExhaustedError(new Error("x"), 3);
      expect(err).toBeInstanceOf(RetryExhaustedError);
      expect(err).toBeInstanceOf(InnovatorError);
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("toJSON across error types", () => {
    it("LlmParseError includes rawOutput context in message", () => {
      const err = new LlmParseError("bad json", "some raw output");
      const json = err.toJSON();
      expect(json.name).toBe("LlmParseError");
      expect(json.code).toBe("ERR_LLM_PARSE");
    });

    it("ConfigurationError serializes with toJSON", () => {
      const err = new ConfigurationError("bad config", "API_KEY");
      const json = err.toJSON();
      expect(json.name).toBe("ConfigurationError");
      expect(json.code).toBe("ERR_CONFIGURATION");
    });

    it("PipelineError serializes with toJSON", () => {
      const err = new PipelineError("generation failed", "generating");
      const json = err.toJSON();
      expect(json.name).toBe("PipelineError");
      expect(json.code).toBe("ERR_PIPELINE");
    });
  });
});
