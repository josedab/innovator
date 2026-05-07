---
id: testing
title: Testing Guide
sidebar_position: 22
---

# Testing Guide

This guide covers how to write, run, and maintain tests across the Innovator monorepo.

## Test Categories

| Category   | Location                                             | Runner     | Environment  |
| ---------- | ---------------------------------------------------- | ---------- | ------------ |
| Unit tests | `packages/*/src/__tests__/`, `apps/*/src/__tests__/` | vitest     | Node / jsdom |
| E2E tests  | `apps/web/e2e/`                                      | Playwright | Chromium     |

## Running Tests

```bash
# All unit tests
npm test

# Watch mode
npm run test:watch

# Specific file
npx vitest run packages/core/src/__tests__/angles.test.ts

# Filter by name
npx vitest -t "extractJson"

# Specific workspace
npx vitest run packages/core/
npx vitest run apps/web/

# Coverage report
npm run test:coverage
```

## Coverage Thresholds

CI enforces a **35% minimum** for lines, functions, and branches (configured in `vitest.config.ts`). This threshold reflects the project's reliance on LLM integration code that is mocked in tests.

Run `npm run test:coverage` locally to check. Pull requests that drop below these thresholds will fail.

## Writing Unit Tests

### File Placement

Place test files in a `__tests__/` directory alongside the source module:

```
packages/core/src/scoring/
├── index.ts
└── __tests__/
    └── scoring.test.ts
```

For web app components:

```
apps/web/src/components/
├── SubjectInput.tsx
└── __tests__/
    └── SubjectInput.test.tsx
```

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("myFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle the expected case", () => {
    const result = myFunction("input");
    expect(result).toBe("expected output");
  });

  it("should handle edge cases", () => {
    expect(() => myFunction("")).toThrow();
  });
});
```

### Test Environment

- **Web app tests** (`apps/web/**`) run in a `jsdom` environment (configured in `vitest.config.ts`)
- **All other tests** use the default Node.js environment

## Mocking LLM Calls

All tests that touch LLM functionality must mock the Copilot SDK and client to avoid real API calls.

### Standard Mock Pattern

```typescript
// Mock the Copilot SDK (required in every test file that imports core modules)
vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
}));

// Mock the client wrapper
vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn(),
}));
```

### Using Mocked Functions

```typescript
import { generateText, extractJson } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

it("should parse LLM response", async () => {
  mockGenerateText.mockResolvedValue('{"ideas": []}');
  mockExtractJson.mockReturnValue('{"ideas": []}');

  const result = await myLlmFunction("test subject");
  expect(result.ideas).toEqual([]);
});
```

### Test Fixtures

Use a standard `MOCK_INVESTIGATION` fixture for investigation-dependent tests:

```typescript
import type { Investigation } from "@innovator/core";

const MOCK_INVESTIGATION: Investigation = {
  summary: "Test summary",
  keyAspects: [{ title: "Aspect", description: "Description" }],
  currentState: "Current state",
  challenges: ["Challenge"],
  opportunities: ["Opportunity"],
};
```

> **Note:** Mock declarations are currently repeated inline in each test file. There are no shared test helpers yet. If you write the same mocks across multiple tests, consider extracting them into a shared helper.

## Testing API Routes

API route tests create `Request` objects and call exported handler functions directly — no HTTP server is needed.

```typescript
import { POST } from "./route";

it("should return 400 for invalid input", async () => {
  const request = new Request("http://localhost:3000/api/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const response = await POST(request);
  expect(response.status).toBe(400);

  const body = await response.json();
  expect(body.error).toBeDefined();
});
```

### Environment Variables in Tests

Use `vi.stubEnv()` to set environment variables in tests:

```typescript
beforeEach(() => {
  vi.stubEnv("INNOVATOR_API_KEY", "test-key");
});
```

## Testing React Components

Component tests use `@testing-library/react`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { SubjectInput } from "../SubjectInput";

it("should call onSubmit with subject text", () => {
  const onSubmit = vi.fn();
  render(<SubjectInput onSubmit={onSubmit} />);

  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "test subject" },
  });
  fireEvent.click(screen.getByText("Investigate"));

  expect(onSubmit).toHaveBeenCalledWith("test subject");
});
```

## E2E Tests with Playwright

End-to-end tests live in `apps/web/e2e/` and test the web app in a real browser.

### Setup

```bash
# Install Playwright browsers (one-time)
cd apps/web
npx playwright install --with-deps chromium

# Ensure core is built
npm run build --workspace=packages/core
```

### Running E2E Tests

```bash
cd apps/web

# Headless
npm run test:e2e

# Interactive UI
npm run test:e2e:ui
```

In local development, Playwright automatically starts the dev server on port 3000. In CI, set `PLAYWRIGHT_BASE_URL` to point to an already-running server.

### Writing E2E Tests

Create `.spec.ts` files in `apps/web/e2e/`:

```typescript
import { test, expect } from "@playwright/test";

test("homepage loads and shows input", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox")).toBeVisible();
});
```

### Playwright Configuration

Key settings from `apps/web/playwright.config.ts`:

| Setting         | Value                                            | Description                        |
| --------------- | ------------------------------------------------ | ---------------------------------- |
| `testDir`       | `./e2e`                                          | Test files directory               |
| `fullyParallel` | `true`                                           | Tests run in parallel              |
| `retries`       | 2 (CI) / 0 (local)                               | Automatic retries on failure in CI |
| `workers`       | 1 (CI) / auto (local)                            | Parallel workers                   |
| `reporter`      | `html`                                           | Generates an HTML report           |
| `baseURL`       | `PLAYWRIGHT_BASE_URL` or `http://localhost:3000` | Base URL for all page navigations  |
| Browser         | Chromium only                                    | Desktop Chrome device profile      |

## CI Pipeline

The full CI pipeline runs via `npm run test:ci`, which executes:

1. Format check (`prettier --check`)
2. Lint (`eslint`)
3. Type check (`tsc --noEmit`)
4. Build all packages
5. Tests with coverage enforcement

You can simulate this locally:

```bash
npm run test:ci
```

Or run the quality gates individually:

```bash
npm run check   # lint + typecheck + format + test
```
