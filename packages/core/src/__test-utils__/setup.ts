/**
 * @module __test-utils__/setup
 *
 * Shared test setup utilities for the Innovator core test suite.
 * Provides common mock configurations and helpers to reduce boilerplate.
 *
 * @example
 * ```typescript
 * import { createMockCopilotClient, mockLlmResponse } from "../__test-utils__/setup.js";
 *
 * const mocks = createMockCopilotClient();
 * mockLlmResponse(mocks, '{"summary": "test"}');
 * ```
 */

import { vi } from "vitest";

// ---- Copilot SDK Mock Setup ----

export interface MockCopilotSession {
  sendAndWait: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

export interface MockCopilotClientInstance {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
}

export interface CopilotMocks {
  client: MockCopilotClientInstance;
  session: MockCopilotSession;
}

/**
 * Create a fully configured mock CopilotClient with session.
 * Call this after `vi.mock("@github/copilot-sdk", ...)` has been set up.
 */
export function createMockCopilotClient(): CopilotMocks {
  const session: MockCopilotSession = {
    sendAndWait: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(vi.fn()),
  };

  const client: MockCopilotClientInstance = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockReturnValue(session),
  };

  return { client, session };
}

/**
 * Configure a mock session to return a specific LLM response text.
 */
export function mockLlmResponse(mocks: CopilotMocks, responseText: string): void {
  mocks.session.sendAndWait.mockResolvedValue({
    data: { content: responseText },
  });
}

/**
 * Configure a mock session to reject with an LLM error.
 */
export function mockLlmError(mocks: CopilotMocks, error: Error): void {
  mocks.session.sendAndWait.mockRejectedValue(error);
}

// ---- Temp Directory Helper ----

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a temp directory for tests that write to disk.
 * Returns the directory path and a cleanup function.
 *
 * @example
 * ```typescript
 * let cleanup: () => void;
 * let dir: string;
 *
 * beforeEach(() => {
 *   ({ dir, cleanup } = createTempDir("my-test"));
 * });
 * afterEach(() => cleanup());
 * ```
 */
export function createTempDir(prefix = "innovator-test"): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}

// ---- Environment Variable Helpers ----

/**
 * Set environment variables for a test block and restore them after.
 * Uses vi.stubEnv under the hood per the project's testing convention.
 *
 * @example
 * ```typescript
 * withEnv({ INNOVATOR_DEFAULT_MODEL: "gpt-5" });
 * // env vars are stubbed for the current test
 * ```
 */
export function withEnv(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value);
  }
}

// ---- Assertion Helpers ----

/**
 * Assert that an async function throws an error matching a specific class and optional message.
 * More readable than expect().rejects.toThrow() for typed error checking.
 */
export async function expectError<T extends Error>(
  fn: () => Promise<unknown>,
  errorClass: new (...args: never[]) => T,
  messagePattern?: string | RegExp
): Promise<T> {
  try {
    await fn();
    throw new Error(`Expected ${errorClass.name} but no error was thrown`);
  } catch (err) {
    if (!(err instanceof errorClass)) {
      throw new Error(
        `Expected ${errorClass.name} but got ${(err as Error).constructor?.name}: ${(err as Error).message}`
      );
    }
    if (messagePattern) {
      const pattern =
        typeof messagePattern === "string" ? new RegExp(messagePattern) : messagePattern;
      if (!pattern.test(err.message)) {
        throw new Error(`Expected message to match ${pattern} but got: "${err.message}"`);
      }
    }
    return err;
  }
}
