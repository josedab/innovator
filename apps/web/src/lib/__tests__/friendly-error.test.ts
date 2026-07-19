import { describe, expect, it } from "vitest";
import { friendlyError } from "../friendly-error";

describe("friendlyError", () => {
  it.each([
    {
      raw: "429",
      expected: {
        title: "Too many requests",
        message: "You're sending requests too quickly. Please wait a moment and try again.",
        hint: "Rate limits reset after 60 seconds.",
      },
    },
    {
      raw: "request timed out",
      expected: {
        title: "Request timed out",
        message: "The AI took too long to respond. Try a shorter or simpler subject.",
        hint: "Complex topics may need multiple shorter sessions.",
      },
    },
    {
      raw: "unauthorized token",
      expected: {
        title: "Authentication error",
        message: "Could not authenticate with the AI provider.",
        hint: "Run `gh auth login` and verify your Copilot subscription is active.",
      },
    },
    {
      raw: "model not found",
      expected: {
        title: "Model unavailable",
        message:
          "The requested AI model is not available. Try a different model or use the default.",
        hint: "Check INNOVATOR_DEFAULT_MODEL in your .env.local file.",
      },
    },
    {
      raw: "network fetch failed",
      expected: {
        title: "Network error",
        message: "Could not connect to the server. Check your internet connection.",
        hint: "If running locally, make sure the dev server is running.",
      },
    },
  ])("returns the exact current copy for $raw", ({ raw, expected }) => {
    expect(friendlyError(raw)).toEqual(expected);
  });

  it("preserves classification precedence", () => {
    expect(friendlyError("fetch aborted with 401").title).toBe("Request timed out");
  });

  it("leaves a short fallback message unchanged", () => {
    expect(friendlyError("Server error")).toEqual({
      title: "Something went wrong",
      message: "Server error",
    });
  });

  it("truncates a fallback message to 200 characters with an ellipsis", () => {
    expect(friendlyError("x".repeat(201))).toEqual({
      title: "Something went wrong",
      message: `${"x".repeat(200)}…`,
    });
  });
});
