import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TestIdea {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}

const coreMock = vi.hoisted(() => {
  const runtime = {
    dispose: vi.fn().mockResolvedValue(undefined),
  };

  return {
    angles: [
      { id: "angle-a", name: "Angle A" },
      { id: "angle-b", name: "Angle B" },
      { id: "angle-c", name: "Angle C" },
      { id: "angle-d", name: "Angle D" },
    ],
    runtime,
    createRuntime: vi.fn(() => runtime),
    investigate: vi.fn(),
    generateForAngle: vi.fn(),
  };
});

const vscodeMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => unknown;

  const state = {
    participant: undefined as { dispose: ReturnType<typeof vi.fn>; iconPath?: unknown } | undefined,
    chatHandler: undefined as Handler | undefined,
    codeLensRegistration: undefined as { dispose: ReturnType<typeof vi.fn> } | undefined,
    commandRegistrations: [] as Array<{
      command: string;
      handler: Handler;
      disposable: { dispose: ReturnType<typeof vi.fn> };
    }>,
    statusBar: undefined as
      | {
          dispose: ReturnType<typeof vi.fn>;
          show: ReturnType<typeof vi.fn>;
          text: string;
          tooltip: string;
          command: string;
        }
      | undefined,
    workspaceFolders: [{ uri: { fsPath: "/workspace/project" } }] as
      | Array<{ uri: { fsPath: string } }>
      | undefined,
    activeTextEditor: undefined as
      | {
          selection: unknown;
          document: { getText(selection: unknown): string };
        }
      | undefined,
    informationChoice: "Just Keep File" as string | undefined,
    terminal: {
      show: vi.fn(),
      sendText: vi.fn(),
    },
  };

  const createChatParticipant = vi.fn((_id: string, handler: Handler) => {
    const participant = { dispose: vi.fn(), iconPath: undefined as unknown };
    state.participant = participant;
    state.chatHandler = handler;
    return participant;
  });

  const registerCodeLensProvider = vi.fn(() => {
    const registration = { dispose: vi.fn() };
    state.codeLensRegistration = registration;
    return registration;
  });

  const registerCommand = vi.fn((command: string, handler: Handler) => {
    const disposable = { dispose: vi.fn() };
    state.commandRegistrations.push({ command, handler, disposable });
    return disposable;
  });

  const executeCommand = vi.fn(async (command: string, ...args: unknown[]) => {
    const registration = state.commandRegistrations.find((item) => item.command === command);
    return registration?.handler(...args);
  });

  const createStatusBarItem = vi.fn(() => {
    const statusBar = {
      dispose: vi.fn(),
      show: vi.fn(),
      text: "",
      tooltip: "",
      command: "",
    };
    state.statusBar = statusBar;
    return statusBar;
  });

  const joinPath = vi.fn((base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath.replace(/\/$/, ""), ...parts].join("/"),
  }));

  const createDirectory = vi.fn().mockResolvedValue(undefined);
  const writeFile = vi.fn().mockResolvedValue(undefined);
  const openTextDocument = vi.fn(async (uri: { fsPath: string }) => ({ uri }));
  const showTextDocument = vi.fn().mockResolvedValue(undefined);
  const showWarningMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const showInformationMessage = vi.fn(async () => state.informationChoice);
  const createTerminal = vi.fn(() => state.terminal);

  return {
    state,
    createChatParticipant,
    registerCodeLensProvider,
    registerCommand,
    executeCommand,
    createStatusBarItem,
    joinPath,
    createDirectory,
    writeFile,
    openTextDocument,
    showTextDocument,
    showWarningMessage,
    showErrorMessage,
    showInformationMessage,
    createTerminal,
  };
});

vi.mock("vscode", () => ({
  chat: {
    createChatParticipant: vscodeMock.createChatParticipant,
  },
  languages: {
    registerCodeLensProvider: vscodeMock.registerCodeLensProvider,
  },
  commands: {
    registerCommand: vscodeMock.registerCommand,
    executeCommand: vscodeMock.executeCommand,
  },
  window: {
    get activeTextEditor() {
      return vscodeMock.state.activeTextEditor;
    },
    createStatusBarItem: vscodeMock.createStatusBarItem,
    showWarningMessage: vscodeMock.showWarningMessage,
    showErrorMessage: vscodeMock.showErrorMessage,
    showInformationMessage: vscodeMock.showInformationMessage,
    showTextDocument: vscodeMock.showTextDocument,
    createTerminal: vscodeMock.createTerminal,
  },
  workspace: {
    get workspaceFolders() {
      return vscodeMock.state.workspaceFolders;
    },
    fs: {
      createDirectory: vscodeMock.createDirectory,
      writeFile: vscodeMock.writeFile,
    },
    openTextDocument: vscodeMock.openTextDocument,
  },
  Uri: {
    joinPath: vscodeMock.joinPath,
  },
  StatusBarAlignment: {
    Right: 2,
  },
  ThemeIcon: class ThemeIcon {
    constructor(public readonly id: string) {}
  },
  Range: class Range {
    constructor(
      public readonly startLine: number,
      public readonly startCharacter: number,
      public readonly endLine: number,
      public readonly endCharacter: number
    ) {}
  },
  CodeLens: class CodeLens {
    constructor(
      public readonly range: unknown,
      public readonly command: unknown
    ) {}
  },
}));

vi.mock("@innovator/core", () => ({
  ANGLES: coreMock.angles,
  createDefaultInnovatorRuntime: coreMock.createRuntime,
  generateForAngle: coreMock.generateForAngle,
  investigate: coreMock.investigate,
}));

function idea(title: string, overrides: Partial<TestIdea> = {}): TestIdea {
  return {
    title,
    description: `${title} description`,
    potentialImpact: `${title} impact`,
    implementationHint: `${title} implementation`,
    ...overrides,
  };
}

function investigation(subject: string) {
  return {
    summary: `${subject} summary`,
    keyAspects: [],
    currentState: `${subject} current state`,
    challenges: [],
    opportunities: [],
  };
}

function createStream() {
  return {
    progress: vi.fn(),
    markdown: vi.fn(),
  };
}

function streamText(stream: ReturnType<typeof createStream>): string {
  return stream.markdown.mock.calls.map(([text]) => text).join("");
}

function createToken() {
  return {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(),
  };
}

async function activateExtension() {
  const extension = await import("../extension.js");
  const subscriptions: Array<{ dispose(): unknown }> = [];
  extension.activate({ subscriptions } as never);

  const command = (name: string) => {
    const registration = vscodeMock.state.commandRegistrations.find(
      (item) => item.command === name
    );
    if (!registration) throw new Error(`Missing command registration: ${name}`);
    return registration.handler;
  };

  if (!vscodeMock.state.chatHandler) throw new Error("Missing chat participant handler");

  return {
    ...extension,
    subscriptions,
    chatHandler: vscodeMock.state.chatHandler,
    command,
  };
}

async function sendChat(
  handler: (...args: unknown[]) => unknown,
  request: { command?: string; prompt: string; threadId?: string }
) {
  const stream = createStream();
  await handler(request, {}, stream, createToken());
  return stream;
}

async function generateIdeas(
  handler: (...args: unknown[]) => unknown,
  subject: string,
  threadId?: string
) {
  return sendChat(handler, { command: "innovate", prompt: subject, threadId });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  vscodeMock.state.participant = undefined;
  vscodeMock.state.chatHandler = undefined;
  vscodeMock.state.codeLensRegistration = undefined;
  vscodeMock.state.commandRegistrations.length = 0;
  vscodeMock.state.statusBar = undefined;
  vscodeMock.state.workspaceFolders = [{ uri: { fsPath: "/workspace/project" } }];
  vscodeMock.state.activeTextEditor = undefined;
  vscodeMock.state.informationChoice = "Just Keep File";

  coreMock.createRuntime.mockImplementation(() => coreMock.runtime);
  coreMock.runtime.dispose.mockResolvedValue(undefined);
  coreMock.investigate.mockImplementation(async (subject: string) => investigation(subject));
  coreMock.generateForAngle.mockImplementation(
    async (subject: string, _investigation: unknown, angleId: string) => ({
      angleId,
      angleName: angleId,
      ideas: [idea(`${subject}-${angleId}`)],
      reasoning: "",
    })
  );

  vscodeMock.createDirectory.mockResolvedValue(undefined);
  vscodeMock.writeFile.mockResolvedValue(undefined);
  vscodeMock.openTextDocument.mockImplementation(async (uri: { fsPath: string }) => ({ uri }));
  vscodeMock.showTextDocument.mockResolvedValue(undefined);
  vscodeMock.showInformationMessage.mockImplementation(
    async () => vscodeMock.state.informationChoice
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VS Code extension characterization", () => {
  it("registers and subscribes the participant, CodeLens provider, commands, and status bar", async () => {
    const { subscriptions } = await activateExtension();

    expect(vscodeMock.createChatParticipant).toHaveBeenCalledWith(
      "innovator.chat",
      expect.any(Function)
    );
    expect(vscodeMock.state.participant?.iconPath).toMatchObject({ id: "lightbulb" });
    expect(coreMock.createRuntime).not.toHaveBeenCalled();

    expect(vscodeMock.registerCodeLensProvider).toHaveBeenCalledWith(
      { pattern: "**/*.{ts,tsx,js,jsx,py,go,rs,java}" },
      expect.objectContaining({ provideCodeLenses: expect.any(Function) })
    );
    expect(vscodeMock.state.commandRegistrations.map(({ command }) => command)).toEqual([
      "innovator.innovateSelection",
      "innovator.createInnovationPR",
      "innovator.innovateComment",
    ]);

    expect(vscodeMock.createStatusBarItem).toHaveBeenCalledWith(2, 100);
    expect(vscodeMock.state.statusBar).toMatchObject({
      text: "$(lightbulb) Innovator",
      tooltip: "AI Innovation Engine — select code and innovate",
      command: "innovator.innovateSelection",
    });
    expect(vscodeMock.state.statusBar?.show).toHaveBeenCalledOnce();

    expect(subscriptions).toEqual([
      vscodeMock.state.participant,
      vscodeMock.state.codeLensRegistration,
      ...vscodeMock.state.commandRegistrations.map(({ disposable }) => disposable),
      vscodeMock.state.statusBar,
    ]);
  });

  it("keeps chat contexts separate by thread ID", async () => {
    const { chatHandler } = await activateExtension();

    await generateIdeas(chatHandler, "alpha", "thread-a");

    const otherThread = await sendChat(chatHandler, {
      command: "score",
      prompt: "",
      threadId: "thread-b",
    });
    const originalThread = await sendChat(chatHandler, {
      command: "score",
      prompt: "",
      threadId: "thread-a",
    });

    expect(streamText(otherThread)).toBe(
      "No ideas to score yet. Run `@innovator /innovate <subject>` first to generate ideas.\n"
    );
    expect(streamText(originalThread)).toContain("| 1 | alpha-angle-a |");
  });

  it("shares the current default context when requests have no thread ID", async () => {
    const { chatHandler } = await activateExtension();

    await generateIdeas(chatHandler, "fallback");
    const score = await sendChat(chatHandler, { command: "score", prompt: "" });

    expect(streamText(score)).toContain("| 1 | fallback-angle-a |");
  });

  it("evicts the oldest context first after fifty stored sessions", async () => {
    const { chatHandler } = await activateExtension();

    await generateIdeas(chatHandler, "oldest", "oldest-thread");
    for (let index = 0; index < 50; index++) {
      await sendChat(chatHandler, {
        command: "unknown",
        prompt: `session ${index}`,
        threadId: `thread-${index}`,
      });
    }

    const score = await sendChat(chatHandler, {
      command: "score",
      prompt: "",
      threadId: "oldest-thread",
    });

    expect(streamText(score)).toBe(
      "No ideas to score yet. Run `@innovator /innovate <subject>` first to generate ideas.\n"
    );
  });

  it("routes investigate, innovate, score, PR, empty, and default chat requests", async () => {
    const { chatHandler } = await activateExtension();

    const investigateStream = await sendChat(chatHandler, {
      command: "investigate",
      prompt: "routing",
      threadId: "routing-thread",
    });
    expect(coreMock.investigate).toHaveBeenLastCalledWith(
      "routing",
      undefined,
      expect.any(AbortSignal)
    );
    expect(streamText(investigateStream)).toContain("## 🔍 Investigation: routing");

    const innovateStream = await generateIdeas(chatHandler, "routing", "routing-thread");
    expect(coreMock.investigate).toHaveBeenCalledOnce();
    expect(coreMock.generateForAngle.mock.calls.map((call) => call[2])).toEqual([
      "angle-a",
      "angle-b",
      "angle-c",
    ]);
    expect(streamText(innovateStream)).toContain("## 💡 Innovation Ideas: routing");

    const scoreStream = await sendChat(chatHandler, {
      command: "score",
      prompt: "ignored",
      threadId: "routing-thread",
    });
    expect(streamText(scoreStream)).toContain("## 📊 Idea Scoring");

    const prStream = await sendChat(chatHandler, {
      command: "pr",
      prompt: "",
      threadId: "routing-thread",
    });
    expect(vscodeMock.executeCommand).toHaveBeenCalledWith("innovator.createInnovationPR");
    expect(streamText(prStream)).toContain("## 🚀 Innovation PR");

    const emptyStream = await sendChat(chatHandler, {
      command: "investigate",
      prompt: "   ",
      threadId: "empty-thread",
    });
    expect(streamText(emptyStream)).toBe(
      [
        "Please provide a subject to investigate or innovate on.\n\n",
        "**Examples:**\n",
        "- `@innovator /investigate quantum computing in healthcare`\n",
        "- `@innovator /innovate sustainable packaging`\n",
        "- `@innovator /score` (uses results from last session)\n",
        "- `@innovator /pr` (create a PR from generated ideas)\n",
      ].join("")
    );

    const defaultStream = await sendChat(chatHandler, {
      command: "unknown",
      prompt: "routing help",
      threadId: "default-thread",
    });
    expect(streamText(defaultStream)).toContain(
      "**Quick start:** `@innovator /investigate routing help`"
    );
  });

  it("preserves selection and missing-ideas warning messages", async () => {
    const { command } = await activateExtension();

    vscodeMock.state.activeTextEditor = {
      selection: {},
      document: { getText: () => "   " },
    };
    await command("innovator.innovateSelection")();
    await command("innovator.createInnovationPR")();

    expect(vscodeMock.showWarningMessage.mock.calls).toEqual([
      ["Select code to innovate on."],
      ["No innovation ideas available. Run @innovator /innovate first."],
    ]);
  });

  it("renders chat errors with the current error message", async () => {
    coreMock.investigate.mockRejectedValueOnce(new Error("core exploded"));
    const { chatHandler } = await activateExtension();

    const stream = await sendChat(chatHandler, {
      command: "investigate",
      prompt: "failure",
      threadId: "failure-thread",
    });

    expect(streamText(stream)).toBe("\n\n❌ **Error:** core exploded\n");
  });

  it("uses the first stored ideas when the create-PR command runs", async () => {
    coreMock.generateForAngle.mockImplementation(
      async (subject: string, _investigation: unknown, angleId: string) => ({
        angleId,
        angleName: angleId,
        ideas: angleId === "angle-a" ? [idea(`${subject} idea`)] : [],
        reasoning: "",
      })
    );
    const { chatHandler, command } = await activateExtension();

    await generateIdeas(chatHandler, "first", "first-thread");
    await generateIdeas(chatHandler, "current", "current-thread");
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    await command("innovator.createInnovationPR")();

    const proposal = Buffer.from(vscodeMock.writeFile.mock.calls[0][1]).toString("utf-8");
    expect(proposal).toContain("#### 1. first idea");
    expect(proposal).not.toContain("current idea");
  });

  it("preserves proposal text, paths, prompts, timestamps, quoting, and command order", async () => {
    const ideas = [
      idea("Builder's Choice", {
        description: "Description 1",
        potentialImpact: "Impact 1",
        implementationHint: "Hint 1",
      }),
      idea("Idea 2", {
        description: "Description 2",
        potentialImpact: "Impact 2",
        implementationHint: "",
      }),
      idea("Idea 3", {
        description: "Description 3",
        potentialImpact: "Impact 3",
        implementationHint: "Hint 3",
      }),
      idea("Idea 4", {
        description: "Description 4",
        potentialImpact: "Impact 4",
        implementationHint: "Hint 4",
      }),
      idea("Idea 5", {
        description: "Description 5",
        potentialImpact: "Impact 5",
        implementationHint: "Hint 5",
      }),
      idea("Idea 6", {
        description: "Description 6",
        potentialImpact: "Impact 6",
        implementationHint: "Hint 6",
      }),
    ];
    coreMock.generateForAngle.mockImplementation(
      async (_subject: string, _investigation: unknown, angleId: string) => ({
        angleId,
        angleName: angleId,
        ideas: angleId === "angle-a" ? ideas : [],
        reasoning: "",
      })
    );
    vscodeMock.state.workspaceFolders = [{ uri: { fsPath: "/workspace/O'Brien" } }];
    vscodeMock.state.informationChoice = "Create Branch & PR";
    const { chatHandler, command } = await activateExtension();
    await generateIdeas(chatHandler, "proposal", "proposal-thread");
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(1700000000000)
      .mockReturnValueOnce(1700000000999);

    await command("innovator.createInnovationPR")();

    expect(now).toHaveBeenCalledTimes(2);
    expect(vscodeMock.joinPath.mock.calls).toEqual([
      [{ fsPath: "/workspace/O'Brien" }, ".github", "innovations"],
      [{ fsPath: "/workspace/O'Brien/.github/innovations" }, "innovation-1700000000000.md"],
    ]);
    expect(vscodeMock.createDirectory).toHaveBeenCalledWith({
      fsPath: "/workspace/O'Brien/.github/innovations",
    });
    expect(vscodeMock.writeFile.mock.calls[0][0]).toEqual({
      fsPath: "/workspace/O'Brien/.github/innovations/innovation-1700000000000.md",
    });
    expect(Buffer.from(vscodeMock.writeFile.mock.calls[0][1]).toString("utf-8")).toBe(
      [
        "## 💡 Innovation Proposal",
        "",
        "Generated by **Innovator AI** — ideas from multiple creativity frameworks.",
        "",
        "### Top Ideas",
        "",
        "#### 1. Builder's Choice",
        "",
        "Description 1",
        "",
        "**Potential Impact:** Impact 1",
        "**Implementation:** Hint 1",
        "",
        "#### 2. Idea 2",
        "",
        "Description 2",
        "",
        "**Potential Impact:** Impact 2",
        "",
        "",
        "#### 3. Idea 3",
        "",
        "Description 3",
        "",
        "**Potential Impact:** Impact 3",
        "**Implementation:** Hint 3",
        "",
        "#### 4. Idea 4",
        "",
        "Description 4",
        "",
        "**Potential Impact:** Impact 4",
        "**Implementation:** Hint 4",
        "",
        "#### 5. Idea 5",
        "",
        "Description 5",
        "",
        "**Potential Impact:** Impact 5",
        "**Implementation:** Hint 5",
        "",
        "---",
        "*Generated by [Innovator](https://github.com/josedab/innovator)*",
      ].join("\n")
    );
    expect(vscodeMock.openTextDocument).toHaveBeenCalledWith({
      fsPath: "/workspace/O'Brien/.github/innovations/innovation-1700000000000.md",
    });
    expect(vscodeMock.showInformationMessage).toHaveBeenCalledWith(
      "Innovation proposal saved to /workspace/O'Brien/.github/innovations/innovation-1700000000000.md",
      "Create Branch & PR",
      "Just Keep File"
    );
    expect(vscodeMock.createTerminal).toHaveBeenCalledWith("Innovator PR");
    expect(vscodeMock.state.terminal.show).toHaveBeenCalledOnce();
    expect(vscodeMock.state.terminal.sendText.mock.calls.map(([command]) => command)).toEqual([
      "git checkout -b innovation/1700000000999",
      "git add '/workspace/O'\\''Brien/.github/innovations/innovation-1700000000000.md'",
      "git commit -m '💡 Innovation Ideas: Builder'\\''s Choice'",
      "gh pr create --title '💡 Innovation Ideas: Builder'\\''s Choice' --body 'See innovation proposal file' --fill",
    ]);
  });

  it("preserves the no-workspace error and current chat success response", async () => {
    coreMock.generateForAngle.mockImplementation(
      async (_subject: string, _investigation: unknown, angleId: string) => ({
        angleId,
        angleName: angleId,
        ideas: angleId === "angle-a" ? [idea("Unwritten proposal")] : [],
        reasoning: "",
      })
    );
    const { chatHandler } = await activateExtension();
    await generateIdeas(chatHandler, "success behavior", "success-thread");
    vscodeMock.state.workspaceFolders = undefined;

    const stream = await sendChat(chatHandler, {
      command: "pr",
      prompt: "",
      threadId: "success-thread",
    });

    expect(vscodeMock.showErrorMessage).toHaveBeenCalledWith("No workspace folder open.");
    expect(vscodeMock.writeFile).not.toHaveBeenCalled();
    expect(streamText(stream)).toBe(
      [
        "## 🚀 Innovation PR\n\n",
        "Creating an innovation proposal from your generated ideas...\n\n",
        "✅ Innovation proposal with 1 ideas has been created.\n\n",
        "The proposal file has been opened. You can:\n",
        "- Edit the proposal before committing\n",
        "- Create a branch and PR directly\n",
        "- Share with your team for review\n",
      ].join("")
    );
  });

  it("disposes one lazily created core runtime during repeated deactivation", async () => {
    const { chatHandler, deactivate } = await activateExtension();

    await sendChat(chatHandler, {
      command: "investigate",
      prompt: "runtime ownership",
      threadId: "runtime-thread",
    });
    await Promise.all([deactivate(), deactivate()]);

    expect(coreMock.createRuntime).toHaveBeenCalledOnce();
    expect(coreMock.runtime.dispose).toHaveBeenCalledOnce();
  });
});
