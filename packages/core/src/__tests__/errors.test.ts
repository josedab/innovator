import { describe, it, expect, vi } from "vitest";

import {
  InnovatorError,
  LlmError,
  LlmTimeoutError,
  LlmParseError,
  ValidationError,
  PipelineError,
  ConfigurationError,
  AbortError,
  isInnovatorError,
} from "../errors.js";

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

  describe("isInnovatorError", () => {
    it("returns true for InnovatorError subtypes", () => {
      expect(isInnovatorError(new InnovatorError("test"))).toBe(true);
      expect(isInnovatorError(new LlmError("test"))).toBe(true);
      expect(isInnovatorError(new LlmTimeoutError(1000))).toBe(true);
      expect(isInnovatorError(new AbortError())).toBe(true);
      expect(isInnovatorError(new PipelineError("test", "investigating"))).toBe(true);
    });

    it("returns false for non-InnovatorError values", () => {
      expect(isInnovatorError(new Error("plain"))).toBe(false);
      expect(isInnovatorError("string")).toBe(false);
      expect(isInnovatorError(null)).toBe(false);
      expect(isInnovatorError(undefined)).toBe(false);
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
  });
});
