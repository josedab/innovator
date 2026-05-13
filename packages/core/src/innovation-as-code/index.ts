/**
 * @module innovation-as-code
 *
 * Innovation-as-Code (IaC) — Version-controlled innovation workflows.
 * Manages `.innovator/` directory structure, config files, session persistence,
 * and session diffing for git-integrated innovation processes.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Investigation, AngleResult, Synthesis } from "../types.js";

// ---- Config Schema ----

export const IaCConfigSchema = z.object({
  version: z.string().default("1.0"),
  defaultModel: z.string().optional(),
  defaultAngles: z.array(z.string()).optional(),
  domainContext: z.string().max(5000).optional(),
  budgetLimits: z
    .object({
      maxCostPerRun: z.number().min(0).optional(),
      maxTokensPerRun: z.number().int().min(0).optional(),
    })
    .optional(),
  federation: z
    .object({
      enabled: z.boolean().default(false),
      endpoint: z.string().optional(),
      sharePatterns: z.boolean().default(false),
    })
    .optional(),
});

export type IaCConfig = z.infer<typeof IaCConfigSchema>;

// ---- Session Schema ----

export const IaCSessionMetadataSchema = z.object({
  durationMs: z.number().min(0).optional(),
  tokenCount: z.number().int().min(0).optional(),
  cost: z.number().min(0).optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

export const IaCSessionSchema = z.object({
  version: z.string().default("1.0"),
  id: z.string(),
  parent: z.string().nullable().default(null),
  subject: z.string(),
  timestamp: z.string(),
  config: z.object({
    model: z.string().optional(),
    angles: z.array(z.string()).optional(),
    domainContext: z.string().optional(),
  }),
  investigation: z
    .object({
      summary: z.string(),
      keyAspects: z.array(z.object({ title: z.string(), description: z.string() })),
      currentState: z.string(),
      challenges: z.array(z.string()),
      opportunities: z.array(z.string()),
    })
    .optional(),
  angleResults: z.array(
    z.object({
      angleId: z.string(),
      angleName: z.string(),
      ideas: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          potentialImpact: z.string(),
          implementationHint: z.string(),
        })
      ),
      reasoning: z.string(),
    })
  ),
  synthesis: z
    .object({
      topIdeas: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          sourceAngle: z.string(),
          potentialImpact: z.string(),
          feasibility: z.enum(["low", "medium", "high"]),
        })
      ),
      themes: z.array(z.string()),
      recommendation: z.string(),
    })
    .optional(),
  metadata: IaCSessionMetadataSchema.optional(),
  tags: z.array(z.string()).default([]),
});

export type IaCSession = z.infer<typeof IaCSessionSchema>;
export type IaCSessionMetadata = z.infer<typeof IaCSessionMetadataSchema>;

// ---- Session Diff ----

export interface SessionDiffEntry {
  field: string;
  type: "added" | "removed" | "changed";
  description: string;
}

export interface SessionDiff {
  sessionA: { id: string; subject: string; timestamp: string };
  sessionB: { id: string; subject: string; timestamp: string };
  entries: SessionDiffEntry[];
  summary: string;
}

// ---- Default Config ----

export const DEFAULT_IAC_CONFIG: IaCConfig = {
  version: "1.0",
};

export const DEFAULT_CONFIG_YAML = `# Innovator Configuration
# See: https://josedab.github.io/innovator/docs/guides/innovation-as-code
version: "1.0"

# Default LLM model (optional, defaults to gpt-4.1)
# defaultModel: gpt-4.1

# Default innovation angles to use (optional, defaults to all 8)
# defaultAngles:
#   - scamper
#   - first-principles
#   - cross-domain
#   - constraints
#   - inversion
#   - perspectives
#   - what-if
#   - trend-collision

# Domain context injected into every investigation (optional)
# domainContext: "We are a fintech company focused on B2B payments"

# Budget limits per pipeline run (optional)
# budgetLimits:
#   maxCostPerRun: 5.00
#   maxTokensPerRun: 100000

# Federation settings (optional)
# federation:
#   enabled: false
#   endpoint: ""
#   sharePatterns: false
`;

export const DEFAULT_ANGLES_YAML = `# Custom Innovation Angles
# Define custom angles beyond the 8 built-in ones.
# See: https://josedab.github.io/innovator/docs/guides/custom-angles
#
# angles:
#   - id: biomimicry
#     name: Biomimicry
#     description: "Draw inspiration from biological systems and natural processes"
#     promptTemplate: |
#       Analyze {{subject}} through the lens of biomimicry.
#       Investigation context: {{investigation}}
#       Generate innovative ideas inspired by biological systems.
#     icon: "🌿"
#     tags:
#       - nature
#       - sustainability
`;

// ---- Core Functions ----

/** Create a session object from pipeline results. */
export function createIaCSession(params: {
  subject: string;
  investigation?: Investigation;
  angleResults: AngleResult[];
  synthesis?: Synthesis;
  model?: string;
  angles?: string[];
  domainContext?: string;
  durationMs?: number;
  tokenCount?: number;
  cost?: number;
  parent?: string;
  tags?: string[];
}): IaCSession {
  return {
    version: "1.0",
    id: randomUUID(),
    parent: params.parent ?? null,
    subject: params.subject,
    timestamp: new Date().toISOString(),
    config: {
      model: params.model,
      angles: params.angles,
      domainContext: params.domainContext,
    },
    investigation: params.investigation,
    angleResults: params.angleResults,
    synthesis: params.synthesis,
    metadata: {
      durationMs: params.durationMs,
      tokenCount: params.tokenCount,
      cost: params.cost,
      model: params.model,
    },
    tags: params.tags ?? [],
  };
}

/** Generate a filename slug from a session. */
export function sessionFileName(session: IaCSession): string {
  const date = session.timestamp.split("T")[0];
  const slug = session.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${date}-${slug}.json`;
}

/** Compute a structural diff between two IaC sessions. */
export function diffSessions(a: IaCSession, b: IaCSession): SessionDiff {
  const entries: SessionDiffEntry[] = [];

  if (a.subject !== b.subject) {
    entries.push({
      field: "subject",
      type: "changed",
      description: `Subject changed from "${a.subject}" to "${b.subject}"`,
    });
  }

  if (!a.investigation && b.investigation) {
    entries.push({ field: "investigation", type: "added", description: "Investigation added" });
  } else if (a.investigation && !b.investigation) {
    entries.push({ field: "investigation", type: "removed", description: "Investigation removed" });
  } else if (a.investigation && b.investigation) {
    if (a.investigation.summary !== b.investigation.summary) {
      entries.push({
        field: "investigation.summary",
        type: "changed",
        description: "Investigation summary changed",
      });
    }
    const aAspects = new Set(a.investigation.keyAspects.map((k) => k.title));
    const bAspects = new Set(b.investigation.keyAspects.map((k) => k.title));
    for (const aspect of bAspects) {
      if (!aAspects.has(aspect)) {
        entries.push({
          field: "investigation.keyAspects",
          type: "added",
          description: `New key aspect: "${aspect}"`,
        });
      }
    }
    for (const aspect of aAspects) {
      if (!bAspects.has(aspect)) {
        entries.push({
          field: "investigation.keyAspects",
          type: "removed",
          description: `Removed key aspect: "${aspect}"`,
        });
      }
    }
    const newChallenges = b.investigation.challenges.filter(
      (c) => !a.investigation!.challenges.includes(c)
    );
    const removedChallenges = a.investigation.challenges.filter(
      (c) => !b.investigation!.challenges.includes(c)
    );
    for (const c of newChallenges) {
      entries.push({
        field: "investigation.challenges",
        type: "added",
        description: `New challenge: "${c.slice(0, 80)}"`,
      });
    }
    for (const c of removedChallenges) {
      entries.push({
        field: "investigation.challenges",
        type: "removed",
        description: `Removed challenge: "${c.slice(0, 80)}"`,
      });
    }
  }

  const aAngles = new Set(a.angleResults.map((r) => r.angleId));
  const bAngles = new Set(b.angleResults.map((r) => r.angleId));
  for (const angle of bAngles) {
    if (!aAngles.has(angle)) {
      const result = b.angleResults.find((r) => r.angleId === angle);
      entries.push({
        field: "angleResults",
        type: "added",
        description: `New angle: ${result?.angleName ?? angle} (${result?.ideas.length ?? 0} ideas)`,
      });
    }
  }
  for (const angle of aAngles) {
    if (!bAngles.has(angle)) {
      entries.push({
        field: "angleResults",
        type: "removed",
        description: `Removed angle: ${angle}`,
      });
    }
  }

  for (const angle of aAngles) {
    if (bAngles.has(angle)) {
      const aResult = a.angleResults.find((r) => r.angleId === angle);
      const bResult = b.angleResults.find((r) => r.angleId === angle);
      if (aResult && bResult && aResult.ideas.length !== bResult.ideas.length) {
        const delta = bResult.ideas.length - aResult.ideas.length;
        entries.push({
          field: `angleResults.${angle}.ideas`,
          type: "changed",
          description: `${aResult.angleName}: ${delta > 0 ? "+" : ""}${delta} ideas (${aResult.ideas.length} → ${bResult.ideas.length})`,
        });
      }
    }
  }

  if (!a.synthesis && b.synthesis) {
    entries.push({ field: "synthesis", type: "added", description: "Synthesis added" });
  } else if (a.synthesis && !b.synthesis) {
    entries.push({ field: "synthesis", type: "removed", description: "Synthesis removed" });
  } else if (a.synthesis && b.synthesis) {
    if (a.synthesis.recommendation !== b.synthesis.recommendation) {
      entries.push({
        field: "synthesis.recommendation",
        type: "changed",
        description: "Strategic recommendation changed",
      });
    }
    if (a.synthesis.topIdeas.length !== b.synthesis.topIdeas.length) {
      entries.push({
        field: "synthesis.topIdeas",
        type: "changed",
        description: `Top ideas count: ${a.synthesis.topIdeas.length} → ${b.synthesis.topIdeas.length}`,
      });
    }
    const newThemes = b.synthesis.themes.filter((t) => !a.synthesis!.themes.includes(t));
    const removedThemes = a.synthesis.themes.filter((t) => !b.synthesis!.themes.includes(t));
    for (const t of newThemes) {
      entries.push({ field: "synthesis.themes", type: "added", description: `New theme: "${t}"` });
    }
    for (const t of removedThemes) {
      entries.push({
        field: "synthesis.themes",
        type: "removed",
        description: `Removed theme: "${t}"`,
      });
    }
  }

  const added = entries.filter((e) => e.type === "added").length;
  const removed = entries.filter((e) => e.type === "removed").length;
  const changed = entries.filter((e) => e.type === "changed").length;
  const summary =
    entries.length === 0
      ? "No differences found between sessions."
      : `${entries.length} changes: ${added} added, ${removed} removed, ${changed} modified.`;

  return {
    sessionA: { id: a.id, subject: a.subject, timestamp: a.timestamp },
    sessionB: { id: b.id, subject: b.subject, timestamp: b.timestamp },
    entries,
    summary,
  };
}

/** Format a session diff as human-readable text. */
export function formatSessionDiff(diff: SessionDiff): string {
  const lines = [
    `Innovation Diff`,
    `━━━━━━━━━━━━━━━`,
    `A: ${diff.sessionA.subject} (${diff.sessionA.timestamp})`,
    `B: ${diff.sessionB.subject} (${diff.sessionB.timestamp})`,
    "",
    diff.summary,
    "",
  ];

  if (diff.entries.length > 0) {
    const added = diff.entries.filter((e) => e.type === "added");
    const removed = diff.entries.filter((e) => e.type === "removed");
    const changed = diff.entries.filter((e) => e.type === "changed");

    if (added.length > 0) {
      lines.push("+ Added:");
      for (const e of added) lines.push(`  + ${e.description}`);
      lines.push("");
    }
    if (removed.length > 0) {
      lines.push("- Removed:");
      for (const e of removed) lines.push(`  - ${e.description}`);
      lines.push("");
    }
    if (changed.length > 0) {
      lines.push("~ Changed:");
      for (const e of changed) lines.push(`  ~ ${e.description}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Generate a GitHub Issue body from a session idea. */
export function ideaToGitHubIssue(
  session: IaCSession,
  idea: {
    title: string;
    description: string;
    potentialImpact: string;
    sourceAngle?: string;
    feasibility?: string;
  }
): { title: string; body: string; labels: string[] } {
  const body = [
    `## 💡 Innovation Idea: ${idea.title}`,
    "",
    `**Source:** Innovation session \`${session.id.slice(0, 8)}\` — ${session.subject}`,
    `**Date:** ${session.timestamp}`,
    idea.sourceAngle ? `**Angle:** ${idea.sourceAngle}` : "",
    idea.feasibility ? `**Feasibility:** ${idea.feasibility}` : "",
    "",
    "### Description",
    "",
    idea.description,
    "",
    "### Potential Impact",
    "",
    idea.potentialImpact,
    "",
    "---",
    `_Generated by [Innovator](https://github.com/josedab/innovator) Innovation-as-Code_`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    title: `💡 ${idea.title}`,
    body,
    labels: ["innovation", "idea"],
  };
}

/** List sessions as a formatted table. */
export function listIaCSessions(sessions: IaCSession[]): string {
  if (sessions.length === 0) return "No innovation sessions found.";

  const lines = [
    "Innovation Sessions",
    "━━━━━━━━━━━━━━━━━━━",
    "",
    "Date        │ Subject                              │ Ideas │ Angles",
    "────────────┼──────────────────────────────────────┼───────┼────────",
  ];

  for (const s of sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
    const date = s.timestamp.split("T")[0];
    const subject = s.subject.slice(0, 36).padEnd(36);
    const ideas = String(s.angleResults.reduce((sum, r) => sum + r.ideas.length, 0)).padStart(5);
    const angles = String(s.angleResults.length).padStart(6);
    lines.push(`${date}  │ ${subject} │ ${ideas} │ ${angles}`);
  }

  lines.push("");
  lines.push(`Total: ${sessions.length} session(s)`);
  return lines.join("\n");
}

/** Validate an IaC session object. */
export function validateIaCSession(data: unknown): string | null {
  const result = IaCSessionSchema.safeParse(data);
  if (result.success) return null;
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

/** Validate an IaC config object. */
export function validateIaCConfig(data: unknown): string | null {
  const result = IaCConfigSchema.safeParse(data);
  if (result.success) return null;
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

// ---- SessionRecord Conversion ----

import type { SessionRecord } from "../types.js";

/** Convert an IaCSession to a SessionRecord for StorageProvider persistence. */
export function iacSessionToRecord(session: IaCSession): SessionRecord {
  return {
    id: session.id,
    subject: session.subject,
    createdAt: session.timestamp,
    updatedAt: session.timestamp,
    investigation: session.investigation,
    angleResults: session.angleResults,
    synthesis: session.synthesis,
    tags: session.tags,
    notes: session.parent ? `Parent session: ${session.parent}` : undefined,
  };
}

/** Convert a SessionRecord to an IaCSession for file-based persistence. */
export function recordToIaCSession(record: SessionRecord): IaCSession {
  return {
    version: "1.0",
    id: record.id,
    parent: null,
    subject: record.subject,
    timestamp: record.createdAt,
    config: {},
    investigation: record.investigation,
    angleResults: record.angleResults,
    synthesis: record.synthesis,
    tags: record.tags,
  };
}
