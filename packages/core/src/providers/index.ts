/**
 * @module providers
 *
 * Model-agnostic LLM provider abstraction. Defines the LLMProvider interface
 * and implements providers for Copilot SDK, OpenAI, Anthropic, and Ollama.
 * Provider selection is configured via .innovator.config.json or environment variables.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ConfigurationError, LlmError } from "../errors.js";

// ---- Provider Interface ----

/** Options for text generation. */
export interface LLMGenerateOptions {
  prompt: string;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Model info returned by listModels(). */
export interface LLMModelInfo {
  id: string;
  name: string;
  provider: string;
}

/** Core LLM provider interface — all providers must implement this. */
export interface LLMProvider {
  readonly id: string;
  readonly name: string;

  /** Generate text and return the full response. */
  generateText(options: LLMGenerateOptions): Promise<string>;

  /** Generate text and stream chunks via callback. Returns the full text. */
  generateStream(options: LLMGenerateOptions, onChunk: (chunk: string) => void): Promise<string>;

  /** List available models for this provider. */
  listModels(): Promise<LLMModelInfo[]>;
}

// ---- Copilot Provider (existing, refactored) ----

export class CopilotProvider implements LLMProvider {
  readonly id = "copilot";
  readonly name = "GitHub Copilot";

  async generateText(options: LLMGenerateOptions): Promise<string> {
    const { generateText } = await import("../copilot/client.js");
    return generateText({
      prompt: options.prompt,
      model: options.model,
      serverMode: true,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
  }

  async generateStream(
    options: LLMGenerateOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const { generateTextStream } = await import("../copilot/client.js");
    return generateTextStream(
      {
        prompt: options.prompt,
        model: options.model,
        serverMode: true,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
      },
      onChunk
    );
  }

  async listModels(): Promise<LLMModelInfo[]> {
    const { KNOWN_MODELS } = await import("../types.js");
    return KNOWN_MODELS.map((id) => ({
      id,
      name: id,
      provider: this.id,
    }));
  }
}

// ---- OpenAI Provider ----

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly name = "OpenAI";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  }

  async generateText(options: LLMGenerateOptions): Promise<string> {
    if (!this.apiKey)
      throw new ConfigurationError("OpenAI API key not configured", "OPENAI_API_KEY");

    const model = options.model ?? "gpt-4.1";
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: options.prompt }],
        temperature: 0.7,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new LlmError(`OpenAI API error: ${response.status} ${response.statusText}`, { model });
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? "";
  }

  async generateStream(
    options: LLMGenerateOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    if (!this.apiKey)
      throw new ConfigurationError("OpenAI API key not configured", "OPENAI_API_KEY");

    const model = options.model ?? "gpt-4.1";
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: options.prompt }],
        temperature: 0.7,
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new LlmError(`OpenAI API error: ${response.status} ${response.statusText}`, { model });
    }

    let fullText = "";
    const reader = response.body?.getReader();
    if (!reader) throw new LlmError("No response body", { model });
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data) as {
            choices: Array<{ delta: { content?: string } }>;
          };
          const content = parsed.choices[0]?.delta?.content ?? "";
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return fullText;
  }

  async listModels(): Promise<LLMModelInfo[]> {
    if (!this.apiKey) return [];
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { data: Array<{ id: string }> };
      return data.data
        .filter((m) => m.id.startsWith("gpt"))
        .map((m) => ({ id: m.id, name: m.id, provider: this.id }));
    } catch {
      return [];
    }
  }
}

// ---- Anthropic Provider ----

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.baseUrl = baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
  }

  async generateText(options: LLMGenerateOptions): Promise<string> {
    if (!this.apiKey)
      throw new ConfigurationError("Anthropic API key not configured", "ANTHROPIC_API_KEY");

    const model = options.model ?? "claude-sonnet-4-20250514";
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: options.prompt }],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new LlmError(`Anthropic API error: ${response.status} ${response.statusText}`, {
        model,
      });
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content.find((c) => c.type === "text")?.text ?? "";
  }

  async generateStream(
    options: LLMGenerateOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    if (!this.apiKey)
      throw new ConfigurationError("Anthropic API key not configured", "ANTHROPIC_API_KEY");

    const model = options.model ?? "claude-sonnet-4-20250514";
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: options.prompt }],
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new LlmError(`Anthropic API error: ${response.status} ${response.statusText}`, {
        model,
      });
    }

    let fullText = "";
    const reader = response.body?.getReader();
    if (!reader) throw new LlmError("No response body", { model });
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6)) as {
            type: string;
            delta?: { text?: string };
          };
          if (data.type === "content_block_delta" && data.delta?.text) {
            fullText += data.delta.text;
            onChunk(data.delta.text);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return fullText;
  }

  async listModels(): Promise<LLMModelInfo[]> {
    return [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: this.id },
      { id: "claude-sonnet-4.5-20250514", name: "Claude Sonnet 4.5", provider: this.id },
      { id: "claude-haiku-4.5-20250514", name: "Claude Haiku 4.5", provider: this.id },
    ];
  }
}

// ---- Ollama Provider ----

export class OllamaProvider implements LLMProvider {
  readonly id = "ollama";
  readonly name = "Ollama (Local)";
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  }

  async generateText(options: LLMGenerateOptions): Promise<string> {
    const model = options.model ?? "llama3";
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: options.prompt,
        stream: false,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new LlmError(`Ollama API error: ${response.status} ${response.statusText}`, { model });
    }

    const data = (await response.json()) as { response: string };
    return data.response ?? "";
  }

  async generateStream(
    options: LLMGenerateOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const model = options.model ?? "llama3";
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: options.prompt,
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new LlmError(`Ollama API error: ${response.status} ${response.statusText}`, { model });
    }

    let fullText = "";
    const reader = response.body?.getReader();
    if (!reader) throw new LlmError("No response body", { model });
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value, { stream: true }).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line) as { response: string; done: boolean };
          if (data.response) {
            fullText += data.response;
            onChunk(data.response);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    return fullText;
  }

  async listModels(): Promise<LLMModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        models: Array<{ name: string }>;
      };
      return (data.models ?? []).map((m) => ({
        id: m.name,
        name: m.name,
        provider: this.id,
      }));
    } catch {
      return [];
    }
  }
}

// ---- Configuration ----

/** Configuration schema for .innovator.config.json */
export const InnovatorConfigSchema = z.object({
  defaultProvider: z.string().default("copilot"),
  providers: z
    .record(
      z.string(),
      z.object({
        enabled: z.boolean().default(true),
        apiKeyEnv: z.string().optional(),
        baseUrl: z.string().optional(),
        defaultModel: z.string().optional(),
      })
    )
    .optional(),
  modelPreferences: z
    .object({
      investigation: z.string().optional(),
      generation: z.string().optional(),
      synthesis: z.string().optional(),
    })
    .optional(),
});

export type InnovatorConfig = z.infer<typeof InnovatorConfigSchema>;

const CONFIG_PATH = join(homedir(), ".innovator", "config.json");

/** Load configuration from ~/.innovator/config.json */
export function loadConfig(): InnovatorConfig {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return InnovatorConfigSchema.parse({});
    }
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return InnovatorConfigSchema.parse(JSON.parse(raw));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Failed to load config from ${CONFIG_PATH}: ${message}. Using defaults.`);
    return InnovatorConfigSchema.parse({});
  }
}

/** Save configuration to ~/.innovator/config.json */
export function saveConfig(config: InnovatorConfig): void {
  const dir = join(homedir(), ".innovator");
  mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// ---- Provider Registry ----

const providers = new Map<string, LLMProvider>();
let activeProviderId: string | null = null;

/**
 * Register a provider instance in the global registry.
 *
 * @param provider - The LLM provider to register. Its `id` is used as the registry key.
 */
export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.id, provider);
}

/**
 * Retrieve a registered provider by its unique identifier.
 *
 * @param id - The provider identifier (e.g. `"copilot"`, `"openai"`, `"anthropic"`, `"ollama"`)
 * @returns The provider instance, or `undefined` if not registered
 */
export function getProvider(id: string): LLMProvider | undefined {
  return providers.get(id);
}

/** Get the currently active provider. Falls back to CopilotProvider. */
export function getActiveProvider(): LLMProvider {
  if (activeProviderId && providers.has(activeProviderId)) {
    return providers.get(activeProviderId)!;
  }
  // Default to copilot
  if (!providers.has("copilot")) {
    registerProvider(new CopilotProvider());
  }
  return providers.get("copilot")!;
}

/**
 * Set the active provider by its identifier.
 *
 * The active provider is used by default for all LLM operations.
 *
 * @param id - The identifier of a previously registered provider
 * @throws {Error} If no provider with the given ID is registered
 */
export function setActiveProvider(id: string): void {
  if (!providers.has(id)) {
    throw new ConfigurationError(`Provider "${id}" is not registered`, id);
  }
  activeProviderId = id;
}

/**
 * List all registered LLM providers.
 *
 * @returns Array of all registered provider instances
 */
export function listProviders(): LLMProvider[] {
  return Array.from(providers.values());
}

/**
 * Initialize providers from configuration.
 *
 * Registers Copilot (always), plus OpenAI, Anthropic, and Ollama based on the
 * provided config or `~/.innovator/config.json`. Sets the active provider
 * according to `config.defaultProvider`.
 *
 * @param config - Optional configuration object. If omitted, loads from `~/.innovator/config.json`.
 */
export function initializeProviders(config?: InnovatorConfig): void {
  const cfg = config ?? loadConfig();

  // Always register Copilot
  registerProvider(new CopilotProvider());

  const providerConfigs = cfg.providers ?? {};

  if (providerConfigs.openai?.enabled !== false) {
    const apiKey = providerConfigs.openai?.apiKeyEnv
      ? process.env[providerConfigs.openai.apiKeyEnv]
      : undefined;
    registerProvider(new OpenAIProvider(apiKey, providerConfigs.openai?.baseUrl));
  }

  if (providerConfigs.anthropic?.enabled !== false) {
    const apiKey = providerConfigs.anthropic?.apiKeyEnv
      ? process.env[providerConfigs.anthropic.apiKeyEnv]
      : undefined;
    registerProvider(new AnthropicProvider(apiKey, providerConfigs.anthropic?.baseUrl));
  }

  if (providerConfigs.ollama?.enabled !== false) {
    registerProvider(new OllamaProvider(providerConfigs.ollama?.baseUrl));
  }

  if (cfg.defaultProvider && providers.has(cfg.defaultProvider)) {
    activeProviderId = cfg.defaultProvider;
  }
}

/** Clear all providers (for testing). */
export function clearProviders(): void {
  providers.clear();
  activeProviderId = null;
}
