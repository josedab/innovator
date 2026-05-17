import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import type { Investigation } from "../types.js";
import {
  DIFFICULTY_CONFIGS,
  DIFFICULTY_BADGES,
  ConstrainedIdeaSchema,
  LadderConstraintSchema,
  type LadderDifficultyLevel,
  type LadderConstraint,
  type ConstrainedIdea,
  type LadderStep,
  type LadderResult,
  type ConstraintLadderConfig,
} from "./types.js";

const LEVELS: LadderDifficultyLevel[] = ["novice", "intermediate", "advanced", "expert", "master"];

function getLevelIndex(level: LadderDifficultyLevel): number {
  return LEVELS.indexOf(level);
}

function buildLadderConstraintPrompt(
  subject: string,
  level: LadderDifficultyLevel,
  existingLadderConstraints: LadderConstraint[]
): string {
  const config = DIFFICULTY_CONFIGS[level];
  const existing =
    existingLadderConstraints.length > 0
      ? `\nExisting constraints from previous levels:\n${existingLadderConstraints.map((c) => `- ${c.description}`).join("\n")}`
      : "";

  return `Generate ${config.constraintCount} new innovation constraints for difficulty level "${level}".

Subject: ${subject}
Level description: ${config.description}
${existing}

Each constraint should force creative thinking. Make them progressively harder.
Types: budget, timeline, technology, team-size, geography, regulation, sustainability, accessibility, backward-compatibility, zero-dependency

Respond in JSON:
{
  "constraints": [
    {
      "type": "budget" | "timeline" | ...,
      "description": "specific constraint description",
      "severity": 0.0-1.0
    }
  ]
}`;
}

function buildConstrainedIdeaPrompt(
  subject: string,
  constraints: LadderConstraint[],
  level: LadderDifficultyLevel,
  investigation?: Investigation
): string {
  const config = DIFFICULTY_CONFIGS[level];
  const constraintList = constraints
    .map((c) => `- [${c.type}] ${c.description} (severity: ${c.severity})`)
    .join("\n");

  return `Generate innovative ideas for this subject under tight constraints.

Subject: ${subject}
Difficulty: ${level} — ${config.description}
${investigation ? `Context: ${investigation.summary.slice(0, 800)}` : ""}

Active constraints:
${constraintList}

Generate 2-3 ideas that satisfy ALL constraints. Rate each for novelty (0-1) and feasibility (0-1).
The novelty threshold for this level is ${config.noveltyThreshold} — ideas should be creative enough to meet it.

Respond in JSON:
{
  "ideas": [
    {
      "title": "...",
      "description": "...",
      "potentialImpact": "...",
      "noveltyScore": 0.0-1.0,
      "feasibilityScore": 0.0-1.0,
      "constraintsSatisfied": ["constraint description 1"],
      "creativeSolution": "how constraints forced creative thinking"
    }
  ]
}`;
}

/** Run the constraint ladder — progressively harder innovation challenges. */
export async function runConstraintLadder(
  subject: string,
  investigation?: Investigation,
  config: ConstraintLadderConfig = {}
): Promise<LadderResult> {
  const startIndex = getLevelIndex(config.startLevel ?? "novice");
  const maxIndex = getLevelIndex(config.maxLevel ?? "master");
  const levelsToRun = LEVELS.slice(startIndex, maxIndex + 1);

  const steps: LadderStep[] = [];
  const allLadderConstraints: LadderConstraint[] = [];
  let highestReached: LadderDifficultyLevel = levelsToRun[0];
  let bestIdea: ConstrainedIdea | undefined;

  for (let i = 0; i < levelsToRun.length; i++) {
    if (config.signal?.aborted) break;
    const level = levelsToRun[i];

    config.onProgress?.({
      stage: "generating-constraints",
      currentLevel: level,
      completedLevels: i,
      totalLevels: levelsToRun.length,
    });

    // Generate constraints for this level
    const newLadderConstraints = await withRetry(
      async () => {
        const raw = await generateText({
          prompt: buildLadderConstraintPrompt(subject, level, allLadderConstraints),
          model: config.model,
          signal: config.signal,
        });
        const parsed = JSON.parse(extractJson(raw));
        return (parsed.constraints ?? []).map(
          (c: { type?: string; description?: string; severity?: number }, idx: number) =>
            LadderConstraintSchema.parse({
              id: `constraint-${level}-${idx}`,
              type: c.type ?? "budget",
              description: c.description ?? "",
              severity: c.severity ?? 0.5,
              appliedAtLevel: level,
            })
        );
      },
      { signal: config.signal }
    );

    allLadderConstraints.push(...newLadderConstraints);

    // Generate ideas under constraints
    config.onProgress?.({
      stage: "generating-ideas",
      currentLevel: level,
      completedLevels: i,
      totalLevels: levelsToRun.length,
    });

    const ideas = await withRetry(
      async () => {
        const raw = await generateText({
          prompt: buildConstrainedIdeaPrompt(subject, allLadderConstraints, level, investigation),
          model: config.model,
          signal: config.signal,
        });
        const parsed = JSON.parse(extractJson(raw));
        return (parsed.ideas ?? []).map((idea: Record<string, unknown>) =>
          ConstrainedIdeaSchema.parse(idea)
        );
      },
      { signal: config.signal }
    );

    const avgNovelty =
      ideas.length > 0
        ? ideas.reduce((sum: number, idea: ConstrainedIdea) => sum + idea.noveltyScore, 0) /
          ideas.length
        : 0;

    const threshold = DIFFICULTY_CONFIGS[level].noveltyThreshold;
    const passed = avgNovelty >= threshold;

    // Track best idea
    for (const idea of ideas) {
      if (
        !bestIdea ||
        idea.noveltyScore * idea.feasibilityScore >
          bestIdea.noveltyScore * bestIdea.feasibilityScore
      ) {
        bestIdea = idea;
      }
    }

    steps.push({
      level,
      constraints: newLadderConstraints,
      ideas,
      averageNovelty: avgNovelty,
      passedThreshold: passed,
      badge: passed ? DIFFICULTY_BADGES[level] : "",
    });

    highestReached = level;

    if (!passed && config.autoCalibrate !== false) {
      break;
    }
  }

  config.onProgress?.({
    stage: "complete",
    currentLevel: highestReached,
    completedLevels: steps.length,
    totalLevels: levelsToRun.length,
  });

  const totalIdeas = steps.reduce((sum, s) => sum + s.ideas.length, 0);

  return {
    subject,
    steps,
    highestLevelReached: highestReached,
    totalIdeasGenerated: totalIdeas,
    bestIdea,
    progressionInsight: `Progressed through ${steps.length} difficulty levels, generating ${totalIdeas} constrained ideas. Highest level: ${highestReached} (${DIFFICULTY_BADGES[highestReached]}).`,
  };
}

/** Convert a constraint ladder result to markdown. */
export function constraintLadderToMarkdown(result: LadderResult): string {
  const lines: string[] = [
    "# LadderConstraint Ladder Results",
    "",
    `**Subject:** ${result.subject}`,
    `**Highest Level:** ${result.highestLevelReached} ${DIFFICULTY_BADGES[result.highestLevelReached]}`,
    `**Total Ideas Generated:** ${result.totalIdeasGenerated}`,
    "",
  ];

  for (const step of result.steps) {
    lines.push(`## Level: ${step.level.toUpperCase()} ${step.passedThreshold ? step.badge : "❌"}`);
    lines.push(
      `**Average Novelty:** ${(step.averageNovelty * 100).toFixed(0)}% | **Passed:** ${step.passedThreshold ? "Yes" : "No"}`
    );
    lines.push("");
    lines.push("**LadderConstraints:**");
    step.constraints.forEach((c) =>
      lines.push(`- [${c.type}] ${c.description} (severity: ${(c.severity * 100).toFixed(0)}%)`)
    );
    lines.push("");
    lines.push("**Ideas:**");
    for (const idea of step.ideas) {
      lines.push(`### ${idea.title}`);
      lines.push(idea.description);
      lines.push(
        `*Novelty: ${(idea.noveltyScore * 100).toFixed(0)}% | Feasibility: ${(idea.feasibilityScore * 100).toFixed(0)}%*`
      );
      lines.push(`**Creative Solution:** ${idea.creativeSolution}`);
      lines.push("");
    }
  }

  if (result.bestIdea) {
    lines.push(
      "## 🏆 Best Idea",
      "",
      `**${result.bestIdea.title}**`,
      result.bestIdea.description,
      ""
    );
  }

  lines.push("## Insight", "", result.progressionInsight);

  return lines.join("\n");
}
