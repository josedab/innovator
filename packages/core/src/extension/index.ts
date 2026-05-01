/**
 * @module extension
 *
 * Copilot Extension / GitHub App handlers.
 * Implements slash commands for integration into Copilot Chat.
 *
 * Users type '@innovator investigate solar energy' in VS Code or GitHub.com.
 * Commands: /investigate, /innovate, /auto, /angles, /presets
 */

import type {
  AngleId,
  Investigation,
  AngleResult,
  Synthesis,
  PipelineProgress,
} from "../types.js";
import { ANGLES } from "../innovation/angles.js";
import { getPresets } from "../presets/index.js";

/** Parsed slash command from chat input. */
export interface SlashCommand {
  command: string;
  args: string;
  rawInput: string;
}

/** Response formatted for chat rendering. */
export interface ChatResponse {
  markdown: string;
  metadata?: Record<string, unknown>;
}

/** Parse a chat message into a slash command. */
export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();

  // Handle @innovator prefix
  const withoutPrefix = trimmed.replace(/^@innovator\s*/i, "");

  // Direct slash command
  const slashMatch = withoutPrefix.match(/^\/(\w+)\s*(.*)/s);
  if (slashMatch) {
    return {
      command: slashMatch[1].toLowerCase(),
      args: slashMatch[2].trim(),
      rawInput: trimmed,
    };
  }

  // Without slash, infer command from first word
  const words = withoutPrefix.split(/\s+/);
  const firstWord = words[0]?.toLowerCase();
  const knownCommands = ["investigate", "innovate", "auto", "angles", "presets", "help"];
  if (firstWord && knownCommands.includes(firstWord)) {
    return {
      command: firstWord,
      args: words.slice(1).join(" "),
      rawInput: trimmed,
    };
  }

  // Default: treat entire input as "auto" command
  if (withoutPrefix.length > 0) {
    return {
      command: "auto",
      args: withoutPrefix,
      rawInput: trimmed,
    };
  }

  return null;
}

/** Format an investigation result for chat display. */
export function formatInvestigationForChat(investigation: Investigation): ChatResponse {
  const lines: string[] = [];
  lines.push("## 📋 Investigation Results\n");
  lines.push(`**Summary:** ${investigation.summary}\n`);

  lines.push("### Key Aspects");
  for (const aspect of investigation.keyAspects) {
    lines.push(`- **${aspect.title}:** ${aspect.description}`);
  }

  lines.push(`\n### Current State\n${investigation.currentState}\n`);

  lines.push("### ⚠️ Challenges");
  for (const c of investigation.challenges) {
    lines.push(`- ${c}`);
  }

  lines.push("\n### ✨ Opportunities");
  for (const o of investigation.opportunities) {
    lines.push(`- ${o}`);
  }

  return { markdown: lines.join("\n") };
}

/** Format angle results for chat display. */
export function formatAngleResultsForChat(results: AngleResult[]): ChatResponse {
  const lines: string[] = [];
  lines.push("## 💡 Innovation Ideas\n");

  for (const result of results) {
    lines.push(`### ${result.angleName}\n`);
    lines.push(`*${result.reasoning}*\n`);

    for (const idea of result.ideas) {
      lines.push(`#### ${idea.title}`);
      lines.push(idea.description);
      lines.push(`- **Impact:** ${idea.potentialImpact}`);
      lines.push(`- **How to start:** ${idea.implementationHint}\n`);
    }
  }

  return {
    markdown: lines.join("\n"),
    metadata: { angleCount: results.length, ideaCount: results.reduce((s, r) => s + r.ideas.length, 0) },
  };
}

/** Format synthesis for chat display. */
export function formatSynthesisForChat(synthesis: Synthesis): ChatResponse {
  const lines: string[] = [];
  lines.push("## 🏆 Synthesis & Top Ideas\n");

  for (const idea of synthesis.topIdeas) {
    const emoji = idea.feasibility === "high" ? "🟢" : idea.feasibility === "medium" ? "🟡" : "🔴";
    lines.push(`### ${emoji} ${idea.title}`);
    lines.push(idea.description);
    lines.push(`- **Source:** ${idea.sourceAngle}`);
    lines.push(`- **Impact:** ${idea.potentialImpact}`);
    lines.push(`- **Feasibility:** ${idea.feasibility}\n`);
  }

  lines.push("### 🔗 Cross-Cutting Themes");
  for (const theme of synthesis.themes) {
    lines.push(`- ${theme}`);
  }

  lines.push(`\n### 📌 Recommendation\n${synthesis.recommendation}`);

  return { markdown: lines.join("\n") };
}

/** Format pipeline progress for incremental chat updates. */
export function formatProgressForChat(progress: PipelineProgress): string {
  switch (progress.stage) {
    case "investigating":
      return "🔍 Investigating subject...";
    case "generating":
      return `⚡ Generating innovations (${progress.completedAngles.length}/${progress.totalAngles})...`;
    case "synthesizing":
      return "🧪 Synthesizing results...";
    case "complete":
      return "✅ Pipeline complete!";
    case "error":
      return `❌ Error: ${progress.error ?? "Unknown error"}`;
    default:
      return `Status: ${progress.stage}`;
  }
}

/** Format the angles list for chat. */
export function formatAnglesForChat(): ChatResponse {
  const lines: string[] = [];
  lines.push("## 💡 Available Innovation Angles\n");

  for (const angle of ANGLES) {
    lines.push(`- ${angle.icon} **${angle.name}** — ${angle.shortDescription}`);
  }

  lines.push("\n*Use `@innovator innovate <subject> --angles scamper,first-principles` to select specific angles.*");

  return { markdown: lines.join("\n") };
}

/** Format presets list for chat. */
export function formatPresetsForChat(): ChatResponse {
  const presets = getPresets();
  const lines: string[] = [];
  lines.push("## 📋 Domain Presets\n");

  for (const preset of presets) {
    lines.push(`### ${preset.icon} ${preset.name}`);
    lines.push(preset.description);
    lines.push(`**Angles:** ${preset.selectedAngles.join(", ")}`);
    lines.push(`**Try:** \`@innovator auto ${preset.suggestedSubject}\`\n`);
  }

  return { markdown: lines.join("\n") };
}

/** Format help text for chat. */
export function formatHelpForChat(): ChatResponse {
  return {
    markdown: `## 🤖 Innovator Help

**Commands:**
- \`@innovator investigate <subject>\` — Analyze a subject
- \`@innovator innovate <subject>\` — Generate ideas using all angles
- \`@innovator auto <subject>\` — Full pipeline with synthesis
- \`@innovator angles\` — List available innovation angles
- \`@innovator presets\` — Browse domain presets
- \`@innovator help\` — Show this help

**Examples:**
- \`@innovator investigate solar energy\`
- \`@innovator auto AI-powered education\`
- \`@innovator innovate remote work tools\`

💡 You can also just type \`@innovator <any subject>\` and it will run the full auto pipeline.`,
  };
}

/** GitHub App manifest for registration. */
export const GITHUB_APP_MANIFEST = {
  name: "Innovator",
  description: "AI-Powered Innovation Engine — explore any subject from multiple innovation angles",
  url: "https://github.com/innovator",
  hook_attributes: {
    url: "https://innovator.app/api/webhooks",
  },
  public: true,
  default_permissions: {},
  default_events: [],
};
