import { describe, it, expect, vi } from "vitest";

vi.mock("@innovator/core/innovation", () => ({
  ANGLES: [
    {
      id: "scamper",
      name: "SCAMPER",
      shortDescription: "Substitute, Combine, Adapt, Modify, Put, Eliminate, Reverse",
      icon: "🔄",
    },
    {
      id: "first-principles",
      name: "First Principles",
      shortDescription: "Decompose to fundamentals",
      icon: "🧱",
    },
    {
      id: "cross-domain",
      name: "Cross-Domain Analogy",
      shortDescription: "Map from other fields",
      icon: "🌐",
    },
  ],
}));

import { listPrompts, getPromptMessages } from "./prompts.js";

describe("MCP Prompts", () => {
  describe("listPrompts", () => {
    it("pins every prompt descriptor and its ordering", () => {
      expect(listPrompts()).toEqual([
        {
          name: "investigate-subject",
          description:
            "Investigate a subject to understand its landscape, challenges, and opportunities before generating innovation ideas",
          arguments: [
            {
              name: "subject",
              description: "The topic or domain to investigate",
              required: true,
            },
            {
              name: "depth",
              description: "Investigation depth: quick, standard, or deep",
              required: false,
            },
          ],
        },
        {
          name: "innovate-with-angle",
          description: "Generate innovation ideas for a subject using a specific creativity angle",
          arguments: [
            { name: "subject", description: "The topic to innovate on", required: true },
            {
              name: "angle",
              description: "Creativity angle: scamper, first-principles, cross-domain",
              required: true,
            },
            { name: "context", description: "Additional context or constraints", required: false },
          ],
        },
        {
          name: "full-innovation-pipeline",
          description:
            "Run the complete innovation pipeline: investigate, generate ideas from all angles, and synthesize top recommendations",
          arguments: [
            { name: "subject", description: "The topic to explore", required: true },
            {
              name: "angles",
              description: "Comma-separated angle IDs (omit for all 8)",
              required: false,
            },
          ],
        },
        {
          name: "innovate-code-architecture",
          description:
            "Analyze code or architecture and generate innovation ideas grounded in the actual codebase context",
          arguments: [
            {
              name: "code_context",
              description: "Code snippet, file path, or architecture description",
              required: true,
            },
            {
              name: "focus",
              description: "Focus area: performance, security, ux, scalability, or general",
              required: false,
            },
          ],
        },
        {
          name: "debate-idea",
          description:
            "Run a structured multi-perspective debate on an innovation idea to stress-test it",
          arguments: [
            { name: "idea", description: "The idea to debate", required: true },
            {
              name: "perspectives",
              description: "Perspectives to include (e.g., cto, investor, end-user)",
              required: false,
            },
          ],
        },
        {
          name: "compare-approaches",
          description: "Compare multiple innovation approaches side-by-side for the same problem",
          arguments: [
            { name: "problem", description: "The problem statement", required: true },
            {
              name: "approaches",
              description: "Comma-separated approaches to compare",
              required: true,
            },
          ],
        },
      ]);
    });
  });

  describe("getPromptMessages", () => {
    it("pins every prompt output including default arguments", () => {
      expect({
        investigate: getPromptMessages("investigate-subject", { subject: "solar energy" }),
        innovate: getPromptMessages("innovate-with-angle", {
          subject: "batteries",
          angle: "scamper",
          context: "Focus on B2B",
        }),
        fullPipeline: getPromptMessages("full-innovation-pipeline", { subject: "AI ethics" }),
        code: getPromptMessages("innovate-code-architecture", {
          code_context: "class UserService { ... }",
        }),
        debate: getPromptMessages("debate-idea", {
          idea: "Replace SQL with a graph database",
        }),
        compare: getPromptMessages("compare-approaches", {
          problem: "scale notification system",
          approaches: "pub/sub, polling, websockets",
        }),
      }).toEqual({
        investigate: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Please investigate the following subject for innovation opportunities. Use the Innovator `investigate` tool with the subject below.\n\n**Subject:** solar energy\n**Depth:** standard\n\nAfter investigation, summarize the key findings: main aspects, current state of the art, challenges, and opportunities. Then suggest which innovation angles would be most productive for this domain.",
            },
          },
        ],
        innovate: [
          {
            role: "user",
            content: {
              type: "text",
              text: 'Generate innovation ideas for the following subject using the **SCAMPER** angle (Substitute, Combine, Adapt, Modify, Put, Eliminate, Reverse).\n\nFirst, use the `investigate` tool to analyze the subject, then use the `innovate` tool with angle "scamper".\n\n**Subject:** batteries\n\n**Additional context:** Focus on B2B\n\nPresent each idea with: title, description, potential impact, and implementation hints.',
            },
          },
        ],
        fullPipeline: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Run a complete innovation analysis on the following subject using the `auto` tool.\n\n**Subject:** AI ethics\n\nUse all 8 innovation angles for maximum coverage.\n\nAfter the pipeline completes, provide:\n1. A brief summary of the investigation findings\n2. The top 5 most impactful ideas across all angles\n3. Cross-cutting themes identified\n4. A strategic recommendation with next steps",
            },
          },
        ],
        code: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Analyze the following code/architecture context and generate innovation ideas focused on **general** improvements.\n\nUse the `investigate` tool first with the architectural context, then the `innovate` tool with the most relevant angles.\n\n**Code/Architecture Context:**\n```\nclass UserService { ... }\n```\n\nFocus on non-obvious improvements — not routine refactoring but genuinely innovative approaches.",
            },
          },
        ],
        debate: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Run a structured debate on the following idea using the `persona-eval` tool with perspectives: cto, end-user, investor, regulator.\n\n**Idea:** Replace SQL with a graph database\n\nFor each perspective, provide:\n- Their initial reaction (support/oppose/neutral)\n- Key concerns or enthusiasm points\n- Conditions under which they'd change their position\n\nThen synthesize the debate into a final assessment with confidence score.",
            },
          },
        ],
        compare: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Compare these innovation approaches for the problem below. For each approach, run the `investigate` tool and then apply the most relevant innovation angles.\n\n**Problem:** scale notification system\n\n**Approaches to compare:**\n1. pub/sub\n2. polling\n3. websockets\n\nProvide a comparison matrix covering: feasibility, impact, novelty, implementation effort, and risk.",
            },
          },
        ],
      });
    });

    it("returns user message for investigate-subject", () => {
      const messages = getPromptMessages("investigate-subject", { subject: "solar energy" });
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content.text).toContain("solar energy");
      expect(messages[0].content.text).toContain("investigate");
    });

    it("returns user message for innovate-with-angle", () => {
      const messages = getPromptMessages("innovate-with-angle", {
        subject: "batteries",
        angle: "scamper",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("SCAMPER");
      expect(messages[0].content.text).toContain("batteries");
    });

    it("returns user message for full-innovation-pipeline", () => {
      const messages = getPromptMessages("full-innovation-pipeline", { subject: "AI ethics" });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("AI ethics");
      expect(messages[0].content.text).toContain("auto");
    });

    it("returns user message for innovate-code-architecture", () => {
      const messages = getPromptMessages("innovate-code-architecture", {
        code_context: "class UserService { ... }",
        focus: "security",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("security");
      expect(messages[0].content.text).toContain("UserService");
    });

    it("returns user message for debate-idea", () => {
      const messages = getPromptMessages("debate-idea", {
        idea: "Replace SQL with a graph database",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("graph database");
      expect(messages[0].content.text).toContain("persona-eval");
    });

    it("returns user message for compare-approaches", () => {
      const messages = getPromptMessages("compare-approaches", {
        problem: "scale notification system",
        approaches: "pub/sub, polling, websockets",
      });
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("pub/sub");
      expect(messages[0].content.text).toContain("polling");
      expect(messages[0].content.text).toContain("websockets");
    });

    it("handles unknown prompt gracefully", () => {
      const messages = getPromptMessages("nonexistent", {});
      expect(messages).toHaveLength(1);
      expect(messages[0].content.text).toContain("Unknown prompt");
    });

    it("uses default depth when not specified", () => {
      const messages = getPromptMessages("investigate-subject", { subject: "quantum" });
      expect(messages[0].content.text).toContain("standard");
    });

    it("includes custom context when provided", () => {
      const messages = getPromptMessages("innovate-with-angle", {
        subject: "test",
        angle: "scamper",
        context: "Focus on B2B use cases",
      });
      expect(messages[0].content.text).toContain("B2B use cases");
    });
  });
});
