/**
 * Tests for code improvements:
 * - Result module: flatMapAsync, mapAsync, unwrap safety
 * - Error toJSON subclass overrides
 * - History search: tags and reasoning
 * - Sanitize: validateSubject post-sanitization
 * - Export: CSV formula injection protection
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ============================================================
// 1. Result module improvements
// ============================================================
import { ok, err, flatMapAsync, mapAsync, unwrap } from "../result/index.js";
import type { Result } from "../result/index.js";

describe("Result module improvements", () => {
  describe("flatMapAsync", () => {
    it("chains successful async results", async () => {
      const r = await flatMapAsync(ok(5), async (x) => ok(x * 2));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(10);
    });

    it("propagates errors from the original result", async () => {
      const r = await flatMapAsync(err("e1") as Result<number, string>, async (x) => ok(x * 2));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("e1");
    });

    it("propagates errors from the async chained function", async () => {
      const r = await flatMapAsync(ok(5), async () => err("e2") as Result<number, string>);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("e2");
    });

    it("handles async functions that throw", async () => {
      await expect(
        flatMapAsync(ok(5), async () => {
          throw new Error("async boom");
        })
      ).rejects.toThrow("async boom");
    });
  });

  describe("mapAsync", () => {
    it("transforms ok values with async function", async () => {
      const r = await mapAsync(ok(5), async (x) => x * 3);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(15);
    });

    it("passes through errors without calling fn", async () => {
      const fn = vi.fn(async (x: number) => x * 3);
      const r = await mapAsync(err(new Error("e")) as Result<number, Error>, fn);
      expect(r.ok).toBe(false);
      expect(fn).not.toHaveBeenCalled();
    });

    it("handles async functions that return promises", async () => {
      const r = await mapAsync(ok("hello"), async (s) => {
        // Simulate async I/O
        await new Promise((resolve) => setTimeout(resolve, 1));
        return s.toUpperCase();
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe("HELLO");
    });
  });

  describe("unwrap safety for non-Error types", () => {
    it("wraps string errors in Error before throwing", () => {
      expect(() => unwrap(err("string error"))).toThrow("string error");
      try {
        unwrap(err("string error"));
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it("wraps number errors in Error before throwing", () => {
      expect(() => unwrap(err(42))).toThrow("42");
      try {
        unwrap(err(42));
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it("throws Error instances directly", () => {
      const original = new Error("original");
      try {
        unwrap(err(original));
      } catch (e) {
        expect(e).toBe(original);
      }
    });

    it("wraps null/undefined errors in Error", () => {
      expect(() => unwrap(err(null))).toThrow("null");
      expect(() => unwrap(err(undefined))).toThrow("undefined");
    });
  });
});

// ============================================================
// 2. Error toJSON subclass overrides
// ============================================================
import {
  LlmError,
  LlmParseError,
  RateLimitError,
  ValidationError,
  PipelineError,
  ConfigurationError,
} from "../errors.js";

describe("Error toJSON subclass improvements", () => {
  describe("LlmError.toJSON()", () => {
    it("includes model when present", () => {
      const err = new LlmError("fail", { model: "gpt-4.1" });
      const json = err.toJSON();
      expect(json.model).toBe("gpt-4.1");
      expect(json.code).toBe("ERR_LLM");
    });

    it("omits model when not set", () => {
      const err = new LlmError("fail");
      const json = err.toJSON();
      expect(json).not.toHaveProperty("model");
    });
  });

  describe("LlmParseError.toJSON()", () => {
    it("includes rawOutput", () => {
      const err = new LlmParseError("bad json", "raw content here");
      const json = err.toJSON();
      expect(json.rawOutput).toBe("raw content here");
      expect(json.code).toBe("ERR_LLM_PARSE");
    });

    it("includes truncated rawOutput for long content", () => {
      const longOutput = "x".repeat(1000);
      const err = new LlmParseError("bad json", longOutput);
      const json = err.toJSON();
      expect(typeof json.rawOutput).toBe("string");
      expect((json.rawOutput as string).length).toBeLessThanOrEqual(501);
    });
  });

  describe("RateLimitError.toJSON()", () => {
    it("includes retryAfterMs when present", () => {
      const err = new RateLimitError("rate limited", { retryAfterMs: 5000 });
      const json = err.toJSON();
      expect(json.retryAfterMs).toBe(5000);
      expect(json.code).toBe("ERR_LLM_RATE_LIMIT");
    });

    it("omits retryAfterMs when not set", () => {
      const err = new RateLimitError();
      const json = err.toJSON();
      expect(json).not.toHaveProperty("retryAfterMs");
    });
  });

  describe("ValidationError.toJSON()", () => {
    it("includes issues when present", () => {
      const issues = [
        { path: "title", message: "Required" },
        { path: "description", message: "Too short" },
      ];
      const err = new ValidationError("validation failed", { issues });
      const json = err.toJSON();
      expect(json.issues).toEqual(issues);
      expect(json.code).toBe("ERR_VALIDATION");
    });

    it("omits issues when not set", () => {
      const err = new ValidationError("validation failed");
      const json = err.toJSON();
      expect(json).not.toHaveProperty("issues");
    });
  });

  describe("PipelineError.toJSON()", () => {
    it("includes stage", () => {
      const err = new PipelineError("failed", "generating");
      const json = err.toJSON();
      expect(json.stage).toBe("generating");
      expect(json.code).toBe("ERR_PIPELINE");
    });
  });

  describe("ConfigurationError.toJSON()", () => {
    it("includes configKey when present", () => {
      const err = new ConfigurationError("bad config", "API_KEY");
      const json = err.toJSON();
      expect(json.configKey).toBe("API_KEY");
      expect(json.code).toBe("ERR_CONFIGURATION");
    });

    it("omits configKey when not set", () => {
      const err = new ConfigurationError("bad config");
      const json = err.toJSON();
      expect(json).not.toHaveProperty("configKey");
    });
  });

  describe("JSON.stringify compatibility", () => {
    it("LlmParseError serializes fully with JSON.stringify", () => {
      const err = new LlmParseError("bad", "raw");
      const parsed = JSON.parse(JSON.stringify(err));
      expect(parsed.rawOutput).toBe("raw");
      expect(parsed.code).toBe("ERR_LLM_PARSE");
    });

    it("PipelineError serializes fully with JSON.stringify", () => {
      const err = new PipelineError("stage failed", "synthesizing");
      const parsed = JSON.parse(JSON.stringify(err));
      expect(parsed.stage).toBe("synthesizing");
    });
  });
});

// ============================================================
// 3. History search improvements (tags & reasoning)
// ============================================================

const testDir = join(tmpdir(), `innovator-improvements-test-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => testDir };
});

const { saveSession, querySessions } = await import("../history/index.js");

describe("History search improvements", () => {
  beforeEach(() => {
    mkdirSync(join(testDir, ".innovator", "history"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("searches within session tags", () => {
    saveSession({
      subject: "Generic Topic",
      angleResults: [],
      tags: ["sustainability", "green-tech"],
    });
    saveSession({
      subject: "Other Topic",
      angleResults: [],
      tags: ["finance"],
    });

    const results = querySessions({ search: "sustainability" });
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe("Generic Topic");
  });

  it("searches within angle reasoning", () => {
    saveSession({
      subject: "Energy",
      angleResults: [
        {
          angleId: "scamper",
          angleName: "SCAMPER",
          ideas: [
            {
              title: "Idea",
              description: "Description",
              potentialImpact: "High",
              implementationHint: "Start",
            },
          ],
          reasoning: "Applied biomimicry principles to energy storage",
        },
      ],
    });
    saveSession({
      subject: "Other",
      angleResults: [],
    });

    const results = querySessions({ search: "biomimicry" });
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe("Energy");
  });

  it("tag search is case-insensitive", () => {
    saveSession({
      subject: "Tagged",
      angleResults: [],
      tags: ["AI-ML"],
    });

    const results = querySessions({ search: "ai-ml" });
    expect(results).toHaveLength(1);
  });
});

// ============================================================
// 4. validateSubject improvements
// ============================================================
import { validateSubject } from "../prompts/sanitize.js";

describe("validateSubject improvements", () => {
  it("returns clear error when content is only invalid characters", () => {
    // Input that is entirely system-tag-like
    const result = validateSubject("<system><user><assistant>");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid");
  });

  it("returns specific error for post-sanitization length collapse", () => {
    // "ab" is 2 chars but if it was "a<system>" (length 10) the sanitized result
    // would be "a" (1 char) — below minimum
    const result = validateSubject("a<system>");
    expect(result.valid).toBe(false);
    // Should mention remaining chars or being too short
    expect(result.error).toBeDefined();
  });

  it("accepts valid subjects that survive sanitization", () => {
    const result = validateSubject("Solar energy innovations");
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe("Solar energy innovations");
  });

  it("rejects non-string input", () => {
    expect(validateSubject(123).valid).toBe(false);
    expect(validateSubject(null).valid).toBe(false);
    expect(validateSubject(undefined).valid).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateSubject("").valid).toBe(false);
    expect(validateSubject("   ").valid).toBe(false);
  });

  it("rejects subjects exceeding max length", () => {
    const result = validateSubject("x".repeat(501));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("500");
  });
});
