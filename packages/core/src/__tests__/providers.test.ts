import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import {
  CopilotProvider,
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  InnovatorConfigSchema,
  loadConfig,
  saveConfig,
  registerProvider,
  getProvider,
  getActiveProvider,
  setActiveProvider,
  listProviders,
  initializeProviders,
  clearProviders,
} from "../providers/index.js";
import type { LLMProvider } from "../providers/index.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

function makeFakeProvider(id: string, name: string): LLMProvider {
  return {
    id,
    name,
    generateText: vi.fn().mockResolvedValue("fake"),
    generateStream: vi.fn().mockResolvedValue("fake"),
    listModels: vi.fn().mockResolvedValue([]),
  };
}

describe("providers", () => {
  beforeEach(() => {
    clearProviders();
    vi.resetAllMocks();
  });

  // ---- Registry ----

  describe("registerProvider", () => {
    it("stores a provider by id", () => {
      const p = makeFakeProvider("test", "Test");
      registerProvider(p);
      expect(getProvider("test")).toBe(p);
    });

    it("overwrites provider with duplicate id", () => {
      const p1 = makeFakeProvider("dup", "First");
      const p2 = makeFakeProvider("dup", "Second");
      registerProvider(p1);
      registerProvider(p2);
      expect(getProvider("dup")?.name).toBe("Second");
    });
  });

  describe("getProvider", () => {
    it("returns undefined for unknown id", () => {
      expect(getProvider("nonexistent")).toBeUndefined();
    });

    it("returns registered provider", () => {
      const p = makeFakeProvider("x", "X");
      registerProvider(p);
      expect(getProvider("x")).toBe(p);
    });
  });

  describe("getActiveProvider / setActiveProvider", () => {
    it("defaults to CopilotProvider when nothing is set", () => {
      const active = getActiveProvider();
      expect(active.id).toBe("copilot");
    });

    it("round-trips active provider", () => {
      const p = makeFakeProvider("custom", "Custom");
      registerProvider(p);
      setActiveProvider("custom");
      expect(getActiveProvider()).toBe(p);
    });

    it("throws when setting unregistered provider", () => {
      expect(() => setActiveProvider("nope")).toThrow('Provider "nope" is not registered');
    });
  });

  describe("listProviders", () => {
    it("returns empty array when none registered", () => {
      expect(listProviders()).toEqual([]);
    });

    it("returns all registered providers", () => {
      registerProvider(makeFakeProvider("a", "A"));
      registerProvider(makeFakeProvider("b", "B"));
      expect(listProviders()).toHaveLength(2);
    });
  });

  describe("clearProviders", () => {
    it("resets registry and active provider", () => {
      registerProvider(makeFakeProvider("x", "X"));
      clearProviders();
      expect(listProviders()).toHaveLength(0);
      expect(getProvider("x")).toBeUndefined();
    });
  });

  // ---- Configuration ----

  describe("InnovatorConfigSchema", () => {
    it("parses empty object with defaults", () => {
      const config = InnovatorConfigSchema.parse({});
      expect(config.defaultProvider).toBe("copilot");
    });

    it("parses full config", () => {
      const config = InnovatorConfigSchema.parse({
        defaultProvider: "openai",
        providers: {
          openai: { enabled: true, apiKeyEnv: "OPENAI_API_KEY" },
        },
        modelPreferences: { investigation: "gpt-4.1" },
      });
      expect(config.defaultProvider).toBe("openai");
      expect(config.providers?.openai?.enabled).toBe(true);
    });
  });

  describe("loadConfig", () => {
    it("returns defaults when file does not exist", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const config = loadConfig();
      expect(config.defaultProvider).toBe("copilot");
    });

    it("reads and parses config from file", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ defaultProvider: "openai" }));
      const config = loadConfig();
      expect(config.defaultProvider).toBe("openai");
    });

    it("returns defaults on malformed JSON", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("{not valid json");
      const config = loadConfig();
      expect(config.defaultProvider).toBe("copilot");
    });

    it("returns defaults on empty config file", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("");
      const config = loadConfig();
      expect(config.defaultProvider).toBe("copilot");
    });
  });

  describe("saveConfig", () => {
    it("writes valid JSON to file", () => {
      const config = InnovatorConfigSchema.parse({ defaultProvider: "anthropic" });
      saveConfig(config);
      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalled();
      const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.defaultProvider).toBe("anthropic");
    });
  });

  // ---- initializeProviders ----

  describe("initializeProviders", () => {
    it("registers CopilotProvider by default", () => {
      initializeProviders({ defaultProvider: "copilot" });
      expect(getProvider("copilot")).toBeDefined();
      expect(getProvider("copilot")?.id).toBe("copilot");
    });

    it("registers all providers when none disabled", () => {
      initializeProviders({ defaultProvider: "copilot" });
      expect(getProvider("copilot")).toBeDefined();
      expect(getProvider("openai")).toBeDefined();
      expect(getProvider("anthropic")).toBeDefined();
      expect(getProvider("ollama")).toBeDefined();
    });

    it("skips disabled providers", () => {
      initializeProviders({
        defaultProvider: "copilot",
        providers: {
          openai: { enabled: false },
        },
      });
      expect(getProvider("openai")).toBeUndefined();
    });

    it("sets active provider from config", () => {
      initializeProviders({ defaultProvider: "openai" });
      expect(getActiveProvider().id).toBe("openai");
    });
  });

  // ---- Provider Instances ----

  describe("CopilotProvider", () => {
    it("has correct id and name", () => {
      const p = new CopilotProvider();
      expect(p.id).toBe("copilot");
      expect(p.name).toBe("GitHub Copilot");
    });
  });

  describe("OpenAIProvider", () => {
    it("has correct id and name", () => {
      const p = new OpenAIProvider("key");
      expect(p.id).toBe("openai");
      expect(p.name).toBe("OpenAI");
    });

    it("throws when generating without api key", async () => {
      const p = new OpenAIProvider("");
      await expect(p.generateText({ prompt: "test" })).rejects.toThrow(
        "OpenAI API key not configured"
      );
    });

    it("returns empty models list without api key", async () => {
      const p = new OpenAIProvider("");
      expect(await p.listModels()).toEqual([]);
    });
  });

  describe("AnthropicProvider", () => {
    it("has correct id and name", () => {
      const p = new AnthropicProvider("key");
      expect(p.id).toBe("anthropic");
      expect(p.name).toBe("Anthropic");
    });

    it("throws when generating without api key", async () => {
      const p = new AnthropicProvider("");
      await expect(p.generateText({ prompt: "test" })).rejects.toThrow(
        "Anthropic API key not configured"
      );
    });

    it("returns static model list", async () => {
      const p = new AnthropicProvider("key");
      const models = await p.listModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === "anthropic")).toBe(true);
    });
  });

  describe("OllamaProvider", () => {
    it("has correct id and name", () => {
      const p = new OllamaProvider();
      expect(p.id).toBe("ollama");
      expect(p.name).toBe("Ollama (Local)");
    });
  });

  // ---- HTTP-level provider tests ----

  describe("OpenAIProvider HTTP", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends correct headers and body format", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "result" } }] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const p = new OpenAIProvider("sk-test", "https://api.openai.com/v1");
      await p.generateText({ prompt: "hello", model: "gpt-4.1" });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({ method: "POST" })
      );
      const opts = fetchMock.mock.calls[0][1];
      expect(opts.headers.Authorization).toBe("Bearer sk-test");
      const body = JSON.parse(opts.body);
      expect(body.model).toBe("gpt-4.1");
      expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    });

    it("parses SSE stream chunks", async () => {
      let idx = 0;
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" there"}}]}\n\ndata: [DONE]\n\n',
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn().mockImplementation(() => {
                if (idx >= chunks.length) return Promise.resolve({ done: true, value: undefined });
                return Promise.resolve({
                  done: false,
                  value: new TextEncoder().encode(chunks[idx++]),
                });
              }),
            }),
          },
        })
      );

      const p = new OpenAIProvider("sk-test");
      const received: string[] = [];
      const result = await p.generateStream({ prompt: "test" }, (c) => received.push(c));
      expect(result).toBe("Hi there");
      expect(received).toEqual(["Hi", " there"]);
    });

    it("throws on non-OK response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests" })
      );
      const p = new OpenAIProvider("sk-test");
      await expect(p.generateText({ prompt: "test" })).rejects.toThrow("OpenAI API error: 429");
    });
  });

  describe("AnthropicProvider HTTP", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends correct headers including anthropic-version", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ content: [{ type: "text", text: "Claude says hi" }] }),
        })
      );

      const p = new AnthropicProvider("sk-ant-key");
      const result = await p.generateText({ prompt: "hi" });
      expect(result).toBe("Claude says hi");

      const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(opts.headers["x-api-key"]).toBe("sk-ant-key");
      expect(opts.headers["anthropic-version"]).toBe("2023-06-01");
      const body = JSON.parse(opts.body);
      expect(body.max_tokens).toBe(4096);
    });

    it("parses SSE stream with content_block_delta events", async () => {
      let idx = 0;
      const chunks = [
        'data: {"type":"content_block_delta","delta":{"text":"A"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"B"}}\n\n',
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn().mockImplementation(() => {
                if (idx >= chunks.length) return Promise.resolve({ done: true, value: undefined });
                return Promise.resolve({
                  done: false,
                  value: new TextEncoder().encode(chunks[idx++]),
                });
              }),
            }),
          },
        })
      );

      const p = new AnthropicProvider("sk-ant-key");
      const received: string[] = [];
      const result = await p.generateStream({ prompt: "test" }, (c) => received.push(c));
      expect(result).toBe("AB");
      expect(received).toEqual(["A", "B"]);
    });
  });

  describe("OllamaProvider HTTP", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends correct body format with stream:false", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: "local response" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const p = new OllamaProvider("http://localhost:11434");
      const result = await p.generateText({ prompt: "hello", model: "llama3" });
      expect(result).toBe("local response");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.stream).toBe(false);
      expect(body.model).toBe("llama3");
      expect(body.prompt).toBe("hello");
    });

    it("parses newline-delimited JSON stream", async () => {
      let idx = 0;
      const chunks = [
        '{"response":"X","done":false}\n',
        '{"response":"Y","done":false}\n{"response":"","done":true}\n',
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          body: {
            getReader: () => ({
              read: vi.fn().mockImplementation(() => {
                if (idx >= chunks.length) return Promise.resolve({ done: true, value: undefined });
                return Promise.resolve({
                  done: false,
                  value: new TextEncoder().encode(chunks[idx++]),
                });
              }),
            }),
          },
        })
      );

      const p = new OllamaProvider();
      const received: string[] = [];
      const result = await p.generateStream({ prompt: "test" }, (c) => received.push(c));
      expect(result).toBe("XY");
      expect(received).toEqual(["X", "Y"]);
    });

    it("lists models from /api/tags", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ models: [{ name: "llama3" }, { name: "mistral" }] }),
        })
      );
      const p = new OllamaProvider();
      const models = await p.listModels();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe("llama3");
    });

    it("returns empty array on connection error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
      const p = new OllamaProvider();
      expect(await p.listModels()).toEqual([]);
    });
  });
});
