/**
 * @module mcp-server/prompts
 *
 * MCP prompt templates for the Innovation Mesh.
 * Exposes reusable prompt templates that MCP clients can invoke
 * to run specific innovation workflows with pre-built instructions.
 */

import { ANGLES } from "@innovator/core";

export interface McpPrompt {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

/** All available prompt templates. */
export function listPrompts(): McpPrompt[] {
  return [
    {
      name: "investigate-subject",
      description:
        "Investigate a subject to understand its landscape, challenges, and opportunities before generating innovation ideas",
      arguments: [
        { name: "subject", description: "The topic or domain to investigate", required: true },
        { name: "depth", description: "Investigation depth: quick, standard, or deep", required: false },
      ],
    },
    {
      name: "innovate-with-angle",
      description:
        "Generate innovation ideas for a subject using a specific creativity angle",
      arguments: [
        { name: "subject", description: "The topic to innovate on", required: true },
        { name: "angle", description: `Creativity angle: ${ANGLES.map((a) => a.id).join(", ")}`, required: true },
        { name: "context", description: "Additional context or constraints", required: false },
      ],
    },
    {
      name: "full-innovation-pipeline",
      description:
        "Run the complete innovation pipeline: investigate, generate ideas from all angles, and synthesize top recommendations",
      arguments: [
        { name: "subject", description: "The topic to explore", required: true },
        { name: "angles", description: "Comma-separated angle IDs (omit for all 8)", required: false },
      ],
    },
    {
      name: "innovate-code-architecture",
      description:
        "Analyze code or architecture and generate innovation ideas grounded in the actual codebase context",
      arguments: [
        { name: "code_context", description: "Code snippet, file path, or architecture description", required: true },
        { name: "focus", description: "Focus area: performance, security, ux, scalability, or general", required: false },
      ],
    },
    {
      name: "debate-idea",
      description:
        "Run a structured multi-perspective debate on an innovation idea to stress-test it",
      arguments: [
        { name: "idea", description: "The idea to debate", required: true },
        { name: "perspectives", description: "Perspectives to include (e.g., cto, investor, end-user)", required: false },
      ],
    },
    {
      name: "compare-approaches",
      description:
        "Compare multiple innovation approaches side-by-side for the same problem",
      arguments: [
        { name: "problem", description: "The problem statement", required: true },
        { name: "approaches", description: "Comma-separated approaches to compare", required: true },
      ],
    },
  ];
}

/** Resolve a prompt template with arguments into messages. */
export function getPromptMessages(
  name: string,
  args: Record<string, string>
): McpPromptMessage[] {
  switch (name) {
    case "investigate-subject": {
      const depth = args.depth ?? "standard";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please investigate the following subject for innovation opportunities. Use the Innovator \`investigate\` tool with the subject below.\n\n**Subject:** ${args.subject}\n**Depth:** ${depth}\n\nAfter investigation, summarize the key findings: main aspects, current state of the art, challenges, and opportunities. Then suggest which innovation angles would be most productive for this domain.`,
          },
        },
      ];
    }

    case "innovate-with-angle": {
      const angle = ANGLES.find((a) => a.id === args.angle);
      const angleName = angle?.name ?? args.angle;
      const angleDesc = angle?.shortDescription ?? "";
      const context = args.context ? `\n\n**Additional context:** ${args.context}` : "";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate innovation ideas for the following subject using the **${angleName}** angle (${angleDesc}).\n\nFirst, use the \`investigate\` tool to analyze the subject, then use the \`innovate\` tool with angle "${args.angle}".\n\n**Subject:** ${args.subject}${context}\n\nPresent each idea with: title, description, potential impact, and implementation hints.`,
          },
        },
      ];
    }

    case "full-innovation-pipeline": {
      const anglesNote = args.angles
        ? `\n\nUse only these angles: ${args.angles}`
        : "\n\nUse all 8 innovation angles for maximum coverage.";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Run a complete innovation analysis on the following subject using the \`auto\` tool.\n\n**Subject:** ${args.subject}${anglesNote}\n\nAfter the pipeline completes, provide:\n1. A brief summary of the investigation findings\n2. The top 5 most impactful ideas across all angles\n3. Cross-cutting themes identified\n4. A strategic recommendation with next steps`,
          },
        },
      ];
    }

    case "innovate-code-architecture": {
      const focus = args.focus ?? "general";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Analyze the following code/architecture context and generate innovation ideas focused on **${focus}** improvements.\n\nUse the \`investigate\` tool first with the architectural context, then the \`innovate\` tool with the most relevant angles.\n\n**Code/Architecture Context:**\n\`\`\`\n${args.code_context}\n\`\`\`\n\nFocus on non-obvious improvements — not routine refactoring but genuinely innovative approaches.`,
          },
        },
      ];
    }

    case "debate-idea": {
      const perspectives = args.perspectives ?? "cto, end-user, investor, regulator";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Run a structured debate on the following idea using the \`persona-eval\` tool with perspectives: ${perspectives}.\n\n**Idea:** ${args.idea}\n\nFor each perspective, provide:\n- Their initial reaction (support/oppose/neutral)\n- Key concerns or enthusiasm points\n- Conditions under which they'd change their position\n\nThen synthesize the debate into a final assessment with confidence score.`,
          },
        },
      ];
    }

    case "compare-approaches": {
      const approaches = args.approaches.split(",").map((a) => a.trim());
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Compare these innovation approaches for the problem below. For each approach, run the \`investigate\` tool and then apply the most relevant innovation angles.\n\n**Problem:** ${args.problem}\n\n**Approaches to compare:**\n${approaches.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\nProvide a comparison matrix covering: feasibility, impact, novelty, implementation effort, and risk.`,
          },
        },
      ];
    }

    default:
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: `Unknown prompt template: ${name}. Available prompts: ${listPrompts().map((p) => p.name).join(", ")}`,
          },
        },
      ];
  }
}
