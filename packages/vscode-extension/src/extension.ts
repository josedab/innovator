/**
 * Innovator VS Code Extension — @innovator chat participant for GitHub Copilot Chat.
 *
 * Registers /investigate, /innovate, and /score slash commands that wrap
 * @innovator/core functions and render rich responses with collapsible sections.
 */

import * as vscode from "vscode";
import {
  investigate,
  generateForAngle,
  ANGLES,
  type Investigation,
  type AngleResult,
  type InnovationIdea,
} from "@innovator/core";

const PARTICIPANT_ID = "innovator.chat";

interface ChatContext {
  lastInvestigation?: Investigation;
  lastIdeas?: InnovationIdea[];
  lastSubject?: string;
}

const sessionContext: ChatContext = {};

export function activate(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, chatHandler);
  participant.iconPath = new vscode.ThemeIcon("lightbulb");
  context.subscriptions.push(participant);
}

export function deactivate() {
  // Cleanup handled by VS Code disposables
}

async function chatHandler(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const command = request.command;
  const prompt = request.prompt.trim();

  if (!prompt && command !== "score") {
    stream.markdown("Please provide a subject to investigate or innovate on.\n\n");
    stream.markdown("**Examples:**\n");
    stream.markdown("- `@innovator /investigate quantum computing in healthcare`\n");
    stream.markdown("- `@innovator /innovate sustainable packaging`\n");
    stream.markdown("- `@innovator /score` (uses results from last session)\n");
    return {};
  }

  try {
    switch (command) {
      case "investigate":
        return await handleInvestigate(prompt, stream, token);
      case "innovate":
        return await handleInnovate(prompt, stream, token);
      case "score":
        return await handleScore(prompt, stream, token);
      default:
        return await handleDefault(prompt, stream, token);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stream.markdown(`\n\n❌ **Error:** ${message}\n`);
    return {};
  }
}

async function handleInvestigate(
  subject: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  stream.progress("Investigating subject...");

  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());

  const result = await investigate(subject, undefined, abortController.signal);

  sessionContext.lastInvestigation = result;
  sessionContext.lastSubject = subject;

  stream.markdown(`## 🔍 Investigation: ${subject}\n\n`);
  stream.markdown(`${result.summary}\n\n`);

  // Key aspects
  stream.markdown(`### Key Aspects\n\n`);
  for (const aspect of result.keyAspects) {
    stream.markdown(`<details>\n<summary><strong>${aspect.title}</strong></summary>\n\n`);
    stream.markdown(`${aspect.description}\n\n`);
    stream.markdown(`</details>\n\n`);
  }

  // Challenges & opportunities
  if (result.challenges.length > 0) {
    stream.markdown(`### ⚠️ Challenges\n\n`);
    for (const c of result.challenges) {
      stream.markdown(`- ${c}\n`);
    }
    stream.markdown("\n");
  }

  if (result.opportunities.length > 0) {
    stream.markdown(`### 🚀 Opportunities\n\n`);
    for (const o of result.opportunities) {
      stream.markdown(`- ${o}\n`);
    }
    stream.markdown("\n");
  }

  stream.markdown(
    `\n---\n💡 *Use \`@innovator /innovate ${subject}\` to generate innovation ideas.*\n`
  );

  return {};
}

async function handleInnovate(
  subject: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  stream.progress("Generating innovation ideas...");

  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());

  // Use cached investigation if same subject, otherwise run new one
  let inv = sessionContext.lastInvestigation;
  if (!inv || sessionContext.lastSubject !== subject) {
    stream.progress("Investigating subject first...");
    inv = await investigate(subject, undefined, abortController.signal);
    sessionContext.lastInvestigation = inv;
    sessionContext.lastSubject = subject;
  }

  // Generate for top 3 angles for quick response
  const selectedAngles = ANGLES.slice(0, 3);
  const allIdeas: InnovationIdea[] = [];

  for (const angle of selectedAngles) {
    if (token.isCancellationRequested) break;
    stream.progress(`Exploring: ${angle.name}...`);

    const result: AngleResult = await generateForAngle(
      subject,
      inv,
      angle.id,
      undefined,
      abortController.signal
    );
    allIdeas.push(...result.ideas);
  }

  sessionContext.lastIdeas = allIdeas;

  stream.markdown(`## 💡 Innovation Ideas: ${subject}\n\n`);
  stream.markdown(`*Generated from ${selectedAngles.length} creativity angles*\n\n`);

  for (const idea of allIdeas) {
    stream.markdown(`<details>\n<summary>🃏 <strong>${idea.title}</strong></summary>\n\n`);
    stream.markdown(`${idea.description}\n\n`);
    stream.markdown(`**Impact:** ${idea.potentialImpact}\n\n`);
    if (idea.implementationHint) {
      stream.markdown(`**How to start:** ${idea.implementationHint}\n\n`);
    }
    stream.markdown(`</details>\n\n`);
  }

  stream.markdown(
    `\n---\n📊 *Use \`@innovator /score\` to rank these ideas by feasibility and impact.*\n`
  );

  return {};
}

async function handleScore(
  _prompt: string,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const ideas = sessionContext.lastIdeas;
  if (!ideas || ideas.length === 0) {
    stream.markdown(
      "No ideas to score yet. Run `@innovator /innovate <subject>` first to generate ideas.\n"
    );
    return {};
  }

  stream.markdown(`## 📊 Idea Scoring\n\n`);
  stream.markdown(`| # | Idea | Feasibility | Impact | Score |\n`);
  stream.markdown(`|---|------|-------------|--------|-------|\n`);

  const scored = ideas.map((idea) => {
    const feasibility = idea.implementationHint.length > 100 ? 3 : idea.implementationHint.length > 30 ? 2 : 1;
    const impactScore = idea.potentialImpact.length > 100 ? 3 : idea.potentialImpact.length > 50 ? 2 : 1;
    const total = feasibility + impactScore;
    return { idea, feasibility, impactScore, total };
  });

  scored.sort((a, b) => b.total - a.total);

  scored.forEach(({ idea, feasibility, impactScore, total }, i) => {
    const fLabel = feasibility === 3 ? "🟢 High" : feasibility === 2 ? "🟡 Med" : "🔴 Low";
    const iLabel = impactScore === 3 ? "🟢 High" : impactScore === 2 ? "🟡 Med" : "🔴 Low";
    stream.markdown(`| ${i + 1} | ${idea.title} | ${fLabel} | ${iLabel} | **${total}/6** |\n`);
  });

  stream.markdown(`\n### 🏆 Top Pick: **${scored[0].idea.title}**\n\n`);
  stream.markdown(`${scored[0].idea.description}\n`);

  return {};
}

async function handleDefault(
  prompt: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  stream.markdown(`### Innovator — AI Innovation Engine\n\n`);
  stream.markdown(`Available commands:\n\n`);
  stream.markdown(`- \`/investigate\` — Analyze a subject for innovation potential\n`);
  stream.markdown(`- \`/innovate\` — Generate ideas using creativity frameworks\n`);
  stream.markdown(`- \`/score\` — Rank and score generated ideas\n\n`);
  stream.markdown(`**Quick start:** \`@innovator /investigate ${prompt || "your subject"}\`\n`);
  return {};
}
