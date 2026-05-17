import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import {
  STAKEHOLDER_PROFILES,
  SimStakeholderReactionSchema,
  DebateTurnSchema,
  type StakeholderRole,
  type SimStakeholderReaction,
  type DebateTurn,
  type StakeholderSimResult,
  type StakeholderSimConfig,
} from "./types.js";

const DEFAULT_ROLES: StakeholderRole[] = [
  "ceo",
  "cto",
  "cfo",
  "end-user",
  "investor",
  "regulator",
  "competitor",
  "partner",
];

function buildReactionPrompt(
  role: StakeholderRole,
  ideaTitle: string,
  ideaDescription: string
): string {
  const profile = STAKEHOLDER_PROFILES[role];
  return `You are a ${profile.title}. React to this innovation idea from your role's perspective.

Your priorities: ${profile.priorities.join(", ")}
Your risk tolerance: ${profile.riskTolerance}
Your perspective: "${profile.perspective}"

Innovation Idea:
Title: ${ideaTitle}
Description: ${ideaDescription}

Respond in JSON:
{
  "sentiment": "strongly-support" | "support" | "neutral" | "concerned" | "opposed",
  "score": 0-10,
  "reaction": "your detailed reaction",
  "keyQuestions": ["question you'd ask"],
  "conditions": ["conditions for your support"],
  "politicalImplications": "political dynamics this creates"
}`;
}

function buildDebatePrompt(
  role: StakeholderRole,
  ideaTitle: string,
  previousTurns: DebateTurn[],
  reactions: SimStakeholderReaction[]
): string {
  const profile = STAKEHOLDER_PROFILES[role];
  const myReaction = reactions.find((r) => r.role === role);
  const context =
    previousTurns.length > 0
      ? previousTurns
          .map((t) => `${STAKEHOLDER_PROFILES[t.role].title} (${t.stance}): "${t.statement}"`)
          .join("\n")
      : "No previous discussion.";

  return `You are a ${profile.title} in a stakeholder debate about: "${ideaTitle}"

Your initial reaction: ${myReaction?.reaction ?? "No initial reaction"}
Your sentiment: ${myReaction?.sentiment ?? "neutral"}

Previous discussion:
${context}

Respond to the discussion from your role's perspective. You may support, oppose, negotiate, or redirect.

Respond in JSON:
{
  "statement": "your argument or response",
  "respondingTo": "${previousTurns.length > 0 ? previousTurns[previousTurns.length - 1].role : ""}",
  "stance": "support" | "oppose" | "negotiate" | "redirect"
}`;
}

/** Run a multi-stakeholder simulation for an innovation idea. */
export async function runStakeholderSimulation(
  ideaTitle: string,
  ideaDescription: string,
  config: StakeholderSimConfig = {}
): Promise<StakeholderSimResult> {
  const roles = config.roles ?? DEFAULT_ROLES;
  const debateRounds = config.debateRounds ?? 1;

  // Phase 1: Individual reactions
  const reactions: SimStakeholderReaction[] = [];
  for (let i = 0; i < roles.length; i++) {
    if (config.signal?.aborted) break;
    const role = roles[i];

    config.onProgress?.({
      stage: "reacting",
      completedReactions: i,
      totalReactions: roles.length,
      currentRole: role,
    });

    try {
      const reaction = await withRetry(
        async () => {
          const raw = await generateText({
            prompt: buildReactionPrompt(role, ideaTitle, ideaDescription),
            model: config.model,
            signal: config.signal,
          });
          const parsed = JSON.parse(extractJson(raw));
          return SimStakeholderReactionSchema.parse({ role, ...parsed });
        },
        { signal: config.signal }
      );
      reactions.push(reaction);
    } catch {
      // Non-critical: skip reaction on failure
    }
  }

  // Phase 2: Debate
  const debate: DebateTurn[] = [];
  for (let round = 0; round < debateRounds; round++) {
    if (config.signal?.aborted) break;

    config.onProgress?.({
      stage: "debating",
      completedReactions: reactions.length,
      totalReactions: roles.length,
      currentRole: `Round ${round + 1}`,
    });

    for (const role of roles) {
      if (config.signal?.aborted) break;
      try {
        const turn = await withRetry(
          async () => {
            const raw = await generateText({
              prompt: buildDebatePrompt(role, ideaTitle, debate, reactions),
              model: config.model,
              signal: config.signal,
            });
            const parsed = JSON.parse(extractJson(raw));
            return DebateTurnSchema.parse({ role, ...parsed });
          },
          { signal: config.signal }
        );
        debate.push(turn);
      } catch {
        // Non-critical
      }
    }
  }

  // Phase 3: Analysis
  config.onProgress?.({
    stage: "analyzing",
    completedReactions: reactions.length,
    totalReactions: roles.length,
  });

  const supportCoalition = reactions
    .filter((r) => r.sentiment === "strongly-support" || r.sentiment === "support")
    .map((r) => r.role);

  const oppositionCoalition = reactions
    .filter((r) => r.sentiment === "concerned" || r.sentiment === "opposed")
    .map((r) => r.role);

  const avgScore =
    reactions.length > 0 ? reactions.reduce((sum, r) => sum + r.score, 0) / reactions.length : 5;

  const politicalFeasibility = avgScore / 10;

  const criticalConditions = reactions
    .flatMap((r) => r.conditions)
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, 20);

  const recommendation =
    politicalFeasibility >= 0.7
      ? `Strong organizational support (${(politicalFeasibility * 100).toFixed(0)}%). ${supportCoalition.length} stakeholders in support coalition. Proceed with addressing key conditions.`
      : politicalFeasibility >= 0.4
        ? `Mixed support (${(politicalFeasibility * 100).toFixed(0)}%). Focus on addressing concerns from ${oppositionCoalition.join(", ")} to build consensus.`
        : `Low feasibility (${(politicalFeasibility * 100).toFixed(0)}%). Significant opposition from ${oppositionCoalition.join(", ")}. Consider pivoting approach or building incremental buy-in.`;

  config.onProgress?.({
    stage: "complete",
    completedReactions: reactions.length,
    totalReactions: roles.length,
  });

  return {
    ideaTitle,
    ideaDescription,
    reactions,
    debate,
    politicalFeasibilityScore: politicalFeasibility,
    supportCoalition,
    oppositionCoalition,
    criticalConditions,
    recommendation,
  };
}

/** Detect natural coalitions among stakeholders based on aligned reactions and debate stances. */
export function detectCoalitions(
  reactions: SimStakeholderReaction[],
  debate: DebateTurn[]
): Array<{ members: StakeholderRole[]; alignment: string; strength: number }> {
  const coalitions: Array<{ members: StakeholderRole[]; alignment: string; strength: number }> = [];

  // Group by sentiment bucket
  const sentimentGroups: Record<string, StakeholderRole[]> = {};
  for (const r of reactions) {
    const bucket =
      r.sentiment === "strongly-support" || r.sentiment === "support"
        ? "pro"
        : r.sentiment === "concerned" || r.sentiment === "opposed"
          ? "anti"
          : "neutral";
    if (!sentimentGroups[bucket]) sentimentGroups[bucket] = [];
    sentimentGroups[bucket].push(r.role);
  }

  if (sentimentGroups["pro"]?.length >= 2) {
    coalitions.push({
      members: sentimentGroups["pro"],
      alignment: "Support coalition — aligned in favor of the idea",
      strength: sentimentGroups["pro"].length / reactions.length,
    });
  }

  if (sentimentGroups["anti"]?.length >= 2) {
    coalitions.push({
      members: sentimentGroups["anti"],
      alignment: "Opposition coalition — aligned against the idea",
      strength: sentimentGroups["anti"].length / reactions.length,
    });
  }

  // Detect debate-based alliances (roles that support each other's statements)
  const allies = new Map<StakeholderRole, Set<StakeholderRole>>();
  for (const turn of debate) {
    if (turn.stance === "support" && turn.respondingTo) {
      if (!allies.has(turn.role)) allies.set(turn.role, new Set());
      allies.get(turn.role)!.add(turn.respondingTo);
    }
  }

  // Find mutual support pairs
  for (const [roleA, supportsA] of allies) {
    for (const roleB of supportsA) {
      if (allies.get(roleB)?.has(roleA)) {
        const exists = coalitions.some(
          (c) => c.members.includes(roleA) && c.members.includes(roleB)
        );
        if (!exists) {
          coalitions.push({
            members: [roleA, roleB],
            alignment: `Mutual support alliance formed during debate`,
            strength: 0.8,
          });
        }
      }
    }
  }

  return coalitions.sort((a, b) => b.strength - a.strength);
}

/** Convert a stakeholder simulation result to markdown. */
export function stakeholderSimToMarkdown(result: StakeholderSimResult): string {
  const lines: string[] = [
    "# Stakeholder Simulation Report",
    "",
    `**Idea:** ${result.ideaTitle}`,
    `**Political Feasibility:** ${(result.politicalFeasibilityScore * 100).toFixed(0)}%`,
    `**Support Coalition:** ${result.supportCoalition.join(", ") || "None"}`,
    `**Opposition:** ${result.oppositionCoalition.join(", ") || "None"}`,
    "",
    "## Individual Reactions",
    "",
  ];

  for (const r of result.reactions) {
    const profile = STAKEHOLDER_PROFILES[r.role];
    lines.push(`### ${profile.title} (${r.role})`);
    lines.push(`**Sentiment:** ${r.sentiment} | **Score:** ${r.score}/10`);
    lines.push(r.reaction);
    if (r.keyQuestions.length > 0) {
      lines.push(`**Key Questions:** ${r.keyQuestions.join("; ")}`);
    }
    if (r.conditions.length > 0) {
      lines.push(`**Conditions:** ${r.conditions.join("; ")}`);
    }
    lines.push("");
  }

  if (result.debate.length > 0) {
    lines.push("## Stakeholder Debate", "");
    for (const turn of result.debate) {
      const profile = STAKEHOLDER_PROFILES[turn.role];
      lines.push(`> **${profile.title}** (${turn.stance}): ${turn.statement}`);
      lines.push("");
    }
  }

  lines.push("## Recommendation", "", result.recommendation);

  if (result.criticalConditions.length > 0) {
    lines.push("", "## Critical Conditions for Approval", "");
    result.criticalConditions.forEach((c) => lines.push(`- ${c}`));
  }

  return lines.join("\n");
}
