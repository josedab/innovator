/**
 * @module mcp-server/resources
 *
 * MCP resource handlers for the Innovation Mesh.
 * Exposes innovation sessions, insights, angle definitions, and configuration
 * as MCP resources accessible by any MCP-compatible client.
 */

import { listSessions, getSession, getPresets, KNOWN_MODELS } from "@innovator/core";
import { ANGLES } from "@innovator/core/innovation";
import type { SessionRecord } from "@innovator/core";

/** Format a session record as a readable markdown resource. */
function sessionToMarkdown(session: SessionRecord): string {
  const lines: string[] = [
    `# Innovation Session: ${session.subject}`,
    "",
    `**ID:** ${session.id}`,
    `**Created:** ${session.createdAt}`,
    `**Updated:** ${session.updatedAt}`,
    session.tags.length > 0 ? `**Tags:** ${session.tags.join(", ")}` : "",
    session.notes ? `**Notes:** ${session.notes}` : "",
    "",
  ];

  if (session.investigation) {
    lines.push("## Investigation", "");
    lines.push(`**Summary:** ${session.investigation.summary}`, "");
    if (session.investigation.keyAspects.length > 0) {
      lines.push("### Key Aspects", "");
      for (const aspect of session.investigation.keyAspects) {
        lines.push(`- **${aspect.title}:** ${aspect.description}`);
      }
      lines.push("");
    }
    if (session.investigation.challenges.length > 0) {
      lines.push("### Challenges", "");
      for (const ch of session.investigation.challenges) lines.push(`- ${ch}`);
      lines.push("");
    }
    if (session.investigation.opportunities.length > 0) {
      lines.push("### Opportunities", "");
      for (const op of session.investigation.opportunities) lines.push(`- ${op}`);
      lines.push("");
    }
  }

  if (session.angleResults.length > 0) {
    lines.push("## Innovation Results", "");
    for (const ar of session.angleResults) {
      lines.push(`### ${ar.angleName} (${ar.angleId})`, "");
      lines.push(`**Reasoning:** ${ar.reasoning}`, "");
      for (const idea of ar.ideas) {
        lines.push(`#### ${idea.title}`, "");
        lines.push(idea.description, "");
        lines.push(`- **Impact:** ${idea.potentialImpact}`);
        lines.push(`- **Implementation:** ${idea.implementationHint}`);
        lines.push("");
      }
    }
  }

  if (session.synthesis) {
    lines.push("## Synthesis", "");
    lines.push(`**Recommendation:** ${session.synthesis.recommendation}`, "");
    if (session.synthesis.themes.length > 0) {
      lines.push("### Themes", "");
      for (const theme of session.synthesis.themes) lines.push(`- ${theme}`);
      lines.push("");
    }
    if (session.synthesis.topIdeas.length > 0) {
      lines.push("### Top Ideas", "");
      for (const idea of session.synthesis.topIdeas) {
        lines.push(
          `- **${idea.title}** (${idea.sourceAngle}, feasibility: ${idea.feasibility}): ${idea.description}`
        );
      }
    }
  }

  return lines.filter(Boolean).join("\n");
}

/**
 * List all available innovation session resources as MCP resource descriptors.
 * @returns Array of resource descriptors with URI, name, description, and MIME type.
 */
export async function listSessionResources(): Promise<
  Array<{ uri: string; name: string; description: string; mimeType: string }>
> {
  const sessions = await listSessions();
  return sessions.map((s) => ({
    uri: `innovation://sessions/${s.id}`,
    name: `Session: ${s.subject}`,
    description: `Innovation session from ${s.createdAt} with ${s.angleResults.length} angle results`,
    mimeType: "text/markdown",
  }));
}

/**
 * Read a specific innovation session resource by its MCP URI.
 * @param uri - MCP resource URI in the form `innovation://sessions/{id}`.
 * @returns An object with `contents` array containing the session as markdown, or a not-found message.
 */
export async function readSessionResource(
  uri: string
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  const id = uri.replace("innovation://sessions/", "");
  const session = await getSession(id);
  if (!session) {
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `Session not found: ${id}`,
        },
      ],
    };
  }
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: sessionToMarkdown(session),
      },
    ],
  };
}

/**
 * Read the angles catalog resource, listing all available creativity angles in markdown table format.
 * @returns An object with `contents` array containing the angles catalog as markdown.
 */
export function readAnglesResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const lines = [
    "# Innovation Angles Catalog",
    "",
    "Available creativity angles for innovation analysis:",
    "",
    "| ID | Name | Description | Icon |",
    "|---|---|---|---|",
    ...ANGLES.map((a) => `| ${a.id} | ${a.name} | ${a.shortDescription} | ${a.icon} |`),
    "",
    "## Usage",
    "",
    "Pass angle IDs to the `innovate` or `auto` tools to select specific angles.",
    "Use `auto` without specifying angles to run all 8 angles automatically.",
  ];
  return {
    contents: [
      {
        uri: "innovation://angles",
        mimeType: "text/markdown",
        text: lines.join("\n"),
      },
    ],
  };
}

/**
 * Read the current server configuration resource (models, angles, presets, environment status).
 * @returns An object with `contents` array containing the config as JSON.
 */
export function readConfigResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const config = {
    defaultModel: process.env.INNOVATOR_DEFAULT_MODEL ?? "gpt-4.1",
    knownModels: KNOWN_MODELS,
    maxConcurrency: 2,
    angles: ANGLES.map((a) => ({ id: a.id, name: a.name })),
    presets: getPresets().map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      angles: p.selectedAngles,
    })),
    environment: {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasOllamaUrl: !!process.env.OLLAMA_BASE_URL,
      timeoutMs: parseInt(process.env.INNOVATOR_LLM_TIMEOUT_MS ?? "90000", 10),
    },
  };
  return {
    contents: [
      {
        uri: "innovation://config",
        mimeType: "application/json",
        text: JSON.stringify(config, null, 2),
      },
    ],
  };
}

/**
 * Read the presets catalog resource, listing pre-configured angle combinations by domain.
 * @returns An object with `contents` array containing the presets catalog as markdown.
 */
export function readPresetsResource(): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  const presets = getPresets();
  const lines = [
    "# Innovation Presets",
    "",
    "Pre-configured angle combinations for common domains:",
    "",
    ...presets.map(
      (p) =>
        `## ${p.icon} ${p.name}\n\n${p.description}\n\n- **Category:** ${p.category}\n- **Angles:** ${p.selectedAngles.join(", ")}\n- **Suggested subject:** ${p.suggestedSubject}\n`
    ),
  ];
  return {
    contents: [
      {
        uri: "innovation://presets",
        mimeType: "text/markdown",
        text: lines.join("\n"),
      },
    ],
  };
}
