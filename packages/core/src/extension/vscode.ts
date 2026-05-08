/**
 * @module extension/vscode
 *
 * VS Code extension helpers for native IDE integration.
 * Provides sidebar panel data, code-context-aware innovation,
 * and Copilot Chat @innovator participant configuration.
 */

// ---- Types ----

/** VS Code sidebar tree item. */
export interface SidebarTreeItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  children?: SidebarTreeItem[];
  command?: {
    command: string;
    arguments?: unknown[];
  };
  contextValue?: string;
}

/** Code selection context for innovation. */
export interface CodeContext {
  filePath: string;
  language: string;
  selectedText: string;
  startLine: number;
  endLine: number;
  fullFileContent?: string;
  projectName?: string;
  dependencies?: string[];
}

/** Innovation suggestion based on code context. */
export interface CodeInnovationSuggestion {
  id: string;
  title: string;
  description: string;
  category: "refactor" | "feature" | "architecture" | "performance" | "testing" | "accessibility";
  priority: "low" | "medium" | "high";
  codeSnippet?: string;
  relatedAngles: string[];
}

/** Copilot Chat participant configuration. */
export interface CopilotParticipantConfig {
  id: string;
  name: string;
  description: string;
  commands: CopilotSlashCommand[];
  sampleQuestions: string[];
}

export interface CopilotSlashCommand {
  name: string;
  description: string;
  sampleInvocation: string;
}

// ---- Sidebar Tree Builder ----

/** Build the sidebar tree for the VS Code extension. */
export function buildSidebarTree(
  recentSessions?: Array<{ subject: string; ideasCount: number; date: string }>,
  templates?: Array<{ id: string; name: string }>,
  insights?: Array<{ title: string; description: string }>
): SidebarTreeItem[] {
  const tree: SidebarTreeItem[] = [];

  // Quick actions
  tree.push({
    id: "quick-actions",
    label: "Quick Actions",
    icon: "⚡",
    children: [
      {
        id: "investigate",
        label: "Investigate Subject",
        icon: "🔍",
        command: { command: "innovator.investigate" },
      },
      {
        id: "innovate-selection",
        label: "Innovate from Selection",
        icon: "💡",
        command: { command: "innovator.innovateFromSelection" },
      },
      {
        id: "auto-pipeline",
        label: "Run Auto Pipeline",
        icon: "🚀",
        command: { command: "innovator.auto" },
      },
      {
        id: "open-canvas",
        label: "Open Innovation Canvas",
        icon: "🎨",
        command: { command: "innovator.openCanvas" },
      },
    ],
  });

  // Recent sessions
  if (recentSessions && recentSessions.length > 0) {
    tree.push({
      id: "recent-sessions",
      label: "Recent Sessions",
      icon: "📋",
      children: recentSessions.slice(0, 10).map((s, i) => ({
        id: `session-${i}`,
        label: s.subject.length > 40 ? s.subject.slice(0, 40) + "…" : s.subject,
        description: `${s.ideasCount} ideas · ${s.date}`,
        command: { command: "innovator.openSession", arguments: [i] },
      })),
    });
  }

  // Templates
  if (templates && templates.length > 0) {
    tree.push({
      id: "templates",
      label: "Workflow Templates",
      icon: "📦",
      children: templates.map((t) => ({
        id: `template-${t.id}`,
        label: t.name,
        command: { command: "innovator.useTemplate", arguments: [t.id] },
      })),
    });
  }

  // Insights
  if (insights && insights.length > 0) {
    tree.push({
      id: "insights",
      label: "AI Insights",
      icon: "🧠",
      children: insights.map((ins, i) => ({
        id: `insight-${i}`,
        label: ins.title,
        description: ins.description,
      })),
    });
  }

  return tree;
}

// ---- Code Context Innovation ----

/** Analyze code context and generate innovation suggestions. */
export function analyzeCodeContext(context: CodeContext): CodeInnovationSuggestion[] {
  const suggestions: CodeInnovationSuggestion[] = [];
  const text = context.selectedText.toLowerCase();
  const lines = context.selectedText.split("\n").length;

  // Detect patterns and suggest innovations
  if (text.includes("todo") || text.includes("fixme") || text.includes("hack")) {
    suggestions.push({
      id: "improve-todo",
      title: "Improve TODO/FIXME areas",
      description: "Generate innovative approaches to resolve these technical debt items.",
      category: "refactor",
      priority: "medium",
      relatedAngles: ["first-principles", "constraints"],
    });
  }

  if (text.includes("class ") || text.includes("interface ") || text.includes("struct ")) {
    suggestions.push({
      id: "architecture-alternatives",
      title: "Explore architectural alternatives",
      description: "Use cross-domain innovation to find better patterns for this data structure.",
      category: "architecture",
      priority: "medium",
      relatedAngles: ["cross-domain", "first-principles", "inversion"],
    });
  }

  if (
    text.includes("for ") ||
    text.includes("while ") ||
    text.includes(".map(") ||
    text.includes(".forEach(")
  ) {
    suggestions.push({
      id: "performance-optimization",
      title: "Optimize iteration patterns",
      description: "Explore alternative approaches that could improve performance.",
      category: "performance",
      priority: "low",
      relatedAngles: ["constraints", "inversion"],
    });
  }

  if (text.includes("test") || text.includes("describe(") || text.includes("it(")) {
    suggestions.push({
      id: "test-innovation",
      title: "Innovate testing strategy",
      description: "Generate novel testing approaches like property-based or mutation testing.",
      category: "testing",
      priority: "low",
      relatedAngles: ["what-if", "inversion", "perspectives"],
    });
  }

  if (lines > 50) {
    suggestions.push({
      id: "decompose-large-block",
      title: "Decompose large code block",
      description:
        "Use SCAMPER methodology to restructure this code into smaller, composable units.",
      category: "refactor",
      priority: "high",
      relatedAngles: ["scamper", "first-principles"],
    });
  }

  // Add a feature suggestion for any code selection
  suggestions.push({
    id: "feature-brainstorm",
    title: `Brainstorm features for ${context.filePath.split("/").pop() ?? "this code"}`,
    description: "Generate innovative feature ideas based on the selected code's functionality.",
    category: "feature",
    priority: "medium",
    relatedAngles: ["scamper", "what-if", "trend-collision"],
  });

  return suggestions;
}

// ---- Copilot Chat Participant ----

/** Get the @innovator Copilot Chat participant configuration. */
export function getCopilotParticipantConfig(): CopilotParticipantConfig {
  return {
    id: "innovator",
    name: "Innovator",
    description:
      "AI-powered innovation assistant. Investigate subjects, generate ideas using multiple thinking angles, and build innovation pipelines.",
    commands: [
      {
        name: "investigate",
        description: "Deep-dive investigation of a subject",
        sampleInvocation: "@innovator /investigate sustainable energy storage",
      },
      {
        name: "innovate",
        description: "Generate ideas using a specific angle",
        sampleInvocation: "@innovator /innovate scamper electric vehicles",
      },
      {
        name: "auto",
        description: "Run full innovation pipeline",
        sampleInvocation: "@innovator /auto AI-powered code review",
      },
      {
        name: "angles",
        description: "List available innovation angles",
        sampleInvocation: "@innovator /angles",
      },
      {
        name: "score",
        description: "Score generated ideas",
        sampleInvocation: "@innovator /score",
      },
      {
        name: "code",
        description: "Innovate based on selected code",
        sampleInvocation: "@innovator /code",
      },
      {
        name: "help",
        description: "Show help information",
        sampleInvocation: "@innovator /help",
      },
    ],
    sampleQuestions: [
      "Investigate the future of quantum computing",
      "Generate SCAMPER ideas for improving developer experience",
      "What innovative approaches could improve this function?",
      "Run a full innovation pipeline on microservices architecture",
    ],
  };
}

/** Generate VS Code extension package.json contribution points. */
export function getExtensionContributions(): Record<string, unknown> {
  const config = getCopilotParticipantConfig();

  return {
    chatParticipants: [
      {
        id: config.id,
        name: config.name,
        description: config.description,
        isSticky: false,
        commands: config.commands.map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
        })),
      },
    ],
    commands: [
      { command: "innovator.investigate", title: "Innovator: Investigate Subject" },
      { command: "innovator.innovateFromSelection", title: "Innovator: Innovate from Selection" },
      { command: "innovator.auto", title: "Innovator: Run Auto Pipeline" },
      { command: "innovator.openCanvas", title: "Innovator: Open Innovation Canvas" },
      { command: "innovator.openSidebar", title: "Innovator: Show Sidebar" },
    ],
    viewsContainers: {
      activitybar: [
        {
          id: "innovator-sidebar",
          title: "Innovator",
          icon: "resources/innovator-icon.svg",
        },
      ],
    },
    views: {
      "innovator-sidebar": [
        { id: "innovator-actions", name: "Quick Actions" },
        { id: "innovator-sessions", name: "Recent Sessions" },
        { id: "innovator-insights", name: "AI Insights" },
      ],
    },
  };
}
