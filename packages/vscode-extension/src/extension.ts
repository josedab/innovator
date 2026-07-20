/**
 * Innovator VS Code Extension — @innovator chat participant for GitHub Copilot Chat.
 *
 * Registers /investigate, /innovate, /score, and /pr slash commands that wrap
 * @innovator/core functions and render rich responses with collapsible sections.
 * Also provides CodeLens annotations for contextual innovation suggestions.
 */
import * as vscode from "vscode";
import type { AngleResult, InnovationIdea } from "@innovator/core/innovation" with {
  "resolution-mode": "import",
};
import { ChatSessionStore, type ChatSessionContext } from "./chat-session-store.js";
import { createInnovationProposal } from "./innovation-pr-flow.js";
import {
  systemClock,
  vscodeInnovationProposalFiles,
  vscodeInnovationProposalUi,
  vscodeInnovationPrTerminal,
} from "./vscode-innovation-pr-adapters.js";

const PARTICIPANT_ID = "innovator.chat";

function importCore() {
  return import("@innovator/core");
}

let coreModule: ReturnType<typeof importCore> | undefined;
let coreRuntime: { dispose(): Promise<void> } | undefined;
let deactivationPromise: Promise<void> | undefined;

function loadCore(): ReturnType<typeof importCore> {
  coreModule ??= importCore().then((core) => {
    coreRuntime ??= core.createDefaultInnovatorRuntime();
    return core;
  });
  return coreModule;
}

const sessionStore = new ChatSessionStore();
const innovationProposalDependencies = {
  files: vscodeInnovationProposalFiles,
  ui: vscodeInnovationProposalUi,
  terminal: vscodeInnovationPrTerminal,
  clock: systemClock,
};

export function activate(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, chatHandler);
  participant.iconPath = new vscode.ThemeIcon("lightbulb");
  context.subscriptions.push(participant);

  // Code Lens provider for TODO/FIXME/HACK comments
  const codeLensProvider = new InnovatorCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { pattern: "**/*.{ts,tsx,js,jsx,py,go,rs,java}" },
      codeLensProvider
    )
  );

  // Command: Innovate on selected code
  context.subscriptions.push(
    vscode.commands.registerCommand("innovator.innovateSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      if (!selection.trim()) {
        vscode.window.showWarningMessage("Select code to innovate on.");
        return;
      }
      const subject = `Improve this code:\n${selection.slice(0, 2000)}`;
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: `@innovator /innovate ${subject}`,
      });
    })
  );

  // Command: Generate Innovation PR
  context.subscriptions.push(
    vscode.commands.registerCommand("innovator.createInnovationPR", async () => {
      const ideas = sessionStore.getFirstIdeas();
      if (!ideas || ideas.length === 0) {
        vscode.window.showWarningMessage(
          "No innovation ideas available. Run @innovator /innovate first."
        );
        return;
      }
      await createInnovationProposal(ideas, innovationProposalDependencies);
    })
  );

  // Command: Innovate on code lens target
  context.subscriptions.push(
    vscode.commands.registerCommand("innovator.innovateComment", async (subject: string) => {
      await vscode.commands.executeCommand("workbench.action.chat.open", {
        query: `@innovator /innovate ${subject}`,
      });
    })
  );

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(lightbulb) Innovator";
  statusBar.tooltip = "AI Innovation Engine — select code and innovate";
  statusBar.command = "innovator.innovateSelection";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate(): Promise<void> {
  deactivationPromise ??= (async () => {
    sessionStore.clear();
    await coreModule?.catch(() => undefined);
    await coreRuntime?.dispose();
  })();
  return deactivationPromise;
}

// ---- CodeLens Provider ----

const INNOVATION_PATTERNS = [
  { pattern: /\/\/\s*TODO:?\s*(.+)/gi, prefix: "Innovate on TODO" },
  { pattern: /\/\/\s*FIXME:?\s*(.+)/gi, prefix: "Innovate on fix" },
  { pattern: /\/\/\s*HACK:?\s*(.+)/gi, prefix: "Innovate on improvement" },
  { pattern: /\/\/\s*OPTIMIZE:?\s*(.+)/gi, prefix: "Innovate on optimization" },
  { pattern: /#\s*TODO:?\s*(.+)/gi, prefix: "Innovate on TODO" },
];

/**
 * VS Code CodeLens provider that detects TODO, FIXME, HACK, and OPTIMIZE comments
 * and renders an inline "💡 Innovate" action above each match.
 *
 * Scanning is capped at the first 500 lines per document to keep the editor responsive.
 */
class InnovatorCodeLensProvider implements vscode.CodeLensProvider {
  /**
   * Scan a document for innovation-relevant comment patterns and return CodeLens items.
   *
   * @param document - The text document to scan for actionable comments.
   * @returns Array of {@link vscode.CodeLens} items, one per matched comment.
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

    for (let line = 0; line < document.lineCount && line < 500; line++) {
      const text = document.lineAt(line).text;
      for (const { pattern, prefix } of INNOVATION_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match) {
          const range = new vscode.Range(line, 0, line, text.length);
          const subject = `${prefix}: ${match[1].trim()} (from ${document.fileName.split("/").pop()})`;
          lenses.push(
            new vscode.CodeLens(range, {
              title: "💡 Innovate",
              command: "innovator.innovateComment",
              arguments: [subject],
            })
          );
        }
      }
    }

    return lenses;
  }
}

/**
 * Main Copilot Chat request handler for the `@innovator` participant.
 *
 * Routes incoming messages to the appropriate slash-command handler
 * (`/investigate`, `/innovate`, `/score`, `/pr`) or falls back to a
 * help/usage response.
 *
 * @param request - The chat request containing the user's prompt and command.
 * @param context - Copilot Chat context (conversation history).
 * @param stream  - Response stream for rendering markdown, progress, and buttons.
 * @param token   - Cancellation token to abort long-running LLM calls.
 * @returns An empty {@link vscode.ChatResult} on success.
 */
async function chatHandler(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const command = request.command;
  const prompt = request.prompt.trim();
  const ctx = sessionStore.getContext(request);

  if (!prompt && command !== "score" && command !== "pr") {
    stream.markdown("Please provide a subject to investigate or innovate on.\n\n");
    stream.markdown("**Examples:**\n");
    stream.markdown("- `@innovator /investigate quantum computing in healthcare`\n");
    stream.markdown("- `@innovator /innovate sustainable packaging`\n");
    stream.markdown("- `@innovator /score` (uses results from last session)\n");
    stream.markdown("- `@innovator /pr` (create a PR from generated ideas)\n");
    return {};
  }

  try {
    switch (command) {
      case "investigate":
        return await handleInvestigate(prompt, stream, token, ctx);
      case "innovate":
        return await handleInnovate(prompt, stream, token, ctx);
      case "score":
        return await handleScore(prompt, stream, token, ctx);
      case "pr":
        return await handlePR(stream, ctx);
      default:
        return await handleDefault(prompt, stream, token, ctx);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stream.markdown(`\n\n❌ **Error:** ${message}\n`);
    return {};
  }
}

/**
 * Handle the `/investigate` slash command — run an AI-powered investigation on a subject
 * and render the findings (summary, key aspects, challenges, opportunities) in chat.
 *
 * @param subject - The topic to investigate.
 * @param stream  - Chat response stream for rendering results.
 * @param token   - Cancellation token for aborting the LLM call.
 * @param ctx     - Session context to cache the investigation for later use.
 */
async function handleInvestigate(
  subject: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  ctx: ChatSessionContext
): Promise<vscode.ChatResult> {
  stream.progress("Investigating subject...");

  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());

  const { investigate } = await loadCore();
  const result = await investigate(subject, undefined, abortController.signal);

  ctx.lastInvestigation = result;
  ctx.lastSubject = subject;

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

/**
 * Handle the `/innovate` slash command — generate innovation ideas using creativity angles.
 *
 * Reuses a cached investigation when the subject matches; otherwise runs a new one.
 * Applies the first 3 creativity angles for a quick response and caches generated ideas.
 *
 * @param subject - The topic to innovate on.
 * @param stream  - Chat response stream for rendering ideas.
 * @param token   - Cancellation token for aborting LLM calls.
 * @param ctx     - Session context for investigation caching and idea storage.
 */
async function handleInnovate(
  subject: string,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  ctx: ChatSessionContext
): Promise<vscode.ChatResult> {
  stream.progress("Generating innovation ideas...");

  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());
  const { ANGLES, generateForAngle, investigate } = await loadCore();

  // Use cached investigation if same subject, otherwise run new one
  let inv = ctx.lastInvestigation;
  if (!inv || ctx.lastSubject !== subject) {
    stream.progress("Investigating subject first...");
    inv = await investigate(subject, undefined, abortController.signal);
    ctx.lastInvestigation = inv;
    ctx.lastSubject = subject;
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

  ctx.lastIdeas = allIdeas;

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

/**
 * Handle the `/score` slash command — rank previously generated ideas by feasibility and impact.
 *
 * Uses heuristic scoring based on the detail level of each idea's implementation hint
 * and impact description. Renders a sorted markdown table with the top pick highlighted.
 *
 * @param _prompt - Unused prompt text (scoring uses cached ideas).
 * @param stream  - Chat response stream for rendering the score table.
 * @param _token  - Unused cancellation token (scoring is synchronous).
 * @param ctx     - Session context containing the ideas to score.
 */
async function handleScore(
  _prompt: string,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  ctx: ChatSessionContext
): Promise<vscode.ChatResult> {
  const ideas = ctx.lastIdeas;
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
    const feasibility =
      idea.implementationHint.length > 100 ? 3 : idea.implementationHint.length > 30 ? 2 : 1;
    const impactScore =
      idea.potentialImpact.length > 100 ? 3 : idea.potentialImpact.length > 50 ? 2 : 1;
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

/**
 * Handle the `/pr` slash command — create an innovation proposal PR from cached ideas.
 *
 * Delegates to the `innovator.createInnovationPR` command which writes a proposal
 * file and optionally creates a Git branch and pull request.
 *
 * @param stream - Chat response stream for status updates.
 * @param ctx    - Session context containing the ideas to include in the PR.
 */
async function handlePR(
  stream: vscode.ChatResponseStream,
  ctx: ChatSessionContext
): Promise<vscode.ChatResult> {
  const ideas = ctx.lastIdeas;
  if (!ideas || ideas.length === 0) {
    stream.markdown("No ideas to create a PR from. Run `@innovator /innovate <subject>` first.\n");
    return {};
  }

  stream.markdown("## 🚀 Innovation PR\n\n");
  stream.markdown("Creating an innovation proposal from your generated ideas...\n\n");

  // Trigger the PR creation command
  await vscode.commands.executeCommand("innovator.createInnovationPR");

  stream.markdown(`✅ Innovation proposal with ${ideas.length} ideas has been created.\n\n`);
  stream.markdown("The proposal file has been opened. You can:\n");
  stream.markdown("- Edit the proposal before committing\n");
  stream.markdown("- Create a branch and PR directly\n");
  stream.markdown("- Share with your team for review\n");

  return {};
}

/**
 * Handle unrecognized commands or bare `@innovator` mentions by rendering
 * a usage guide with available slash commands and quick-start examples.
 *
 * @param prompt - The user's raw prompt text (used in the example command).
 * @param stream - Chat response stream for rendering the help text.
 * @param _token - Unused cancellation token.
 * @param _ctx   - Unused session context.
 */
async function handleDefault(
  prompt: string,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
  _ctx: ChatSessionContext
): Promise<vscode.ChatResult> {
  stream.markdown(`### Innovator — AI Innovation Engine\n\n`);
  stream.markdown(`Available commands:\n\n`);
  stream.markdown(`- \`/investigate\` — Analyze a subject for innovation potential\n`);
  stream.markdown(`- \`/innovate\` — Generate ideas using creativity frameworks\n`);
  stream.markdown(`- \`/score\` — Rank and score generated ideas\n`);
  stream.markdown(`- \`/pr\` — Create a PR from generated innovation ideas\n\n`);
  stream.markdown(`**Quick start:** \`@innovator /investigate ${prompt || "your subject"}\`\n`);
  stream.markdown(
    `\n💡 *Tip: Select code and use the "💡 Innovate" CodeLens on TODO/FIXME comments!*\n`
  );
  return {};
}
