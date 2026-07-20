import { describe, expect, it, vi } from "vitest";
import { createInnovationProposal } from "../innovation-pr-flow.js";

const ideas = [
  {
    title: "Flow idea",
    description: "Flow description",
    potentialImpact: "Flow impact",
    implementationHint: "Flow implementation",
  },
];

function createDependencies() {
  const terminal = {
    show: vi.fn(),
    sendText: vi.fn(),
  };
  const files = {
    getWorkspaceRoot: vi.fn(() => "/workspace"),
    joinPath: vi.fn((base: string, ...segments: string[]) => [base, ...segments].join("/")),
    getFileSystemPath: vi.fn((location: string) => location),
    createDirectory: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    writeTextFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    openTextDocument: vi.fn(async (location: string) => `document:${location}`),
  };
  const ui = {
    showTextDocument: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValue("Create Branch & PR"),
  };
  const terminalAdapter = {
    createTerminal: vi.fn(() => terminal),
  };
  const clock = {
    now: vi.fn().mockReturnValueOnce(1700000000000).mockReturnValueOnce(1700000000999),
  };

  return { files, ui, terminal, terminalAdapter, clock };
}

describe("innovation proposal flow", () => {
  it("reports the current no-workspace message without invoking file or terminal work", async () => {
    const dependencies = createDependencies();
    dependencies.files.getWorkspaceRoot.mockReturnValue(undefined as unknown as string);

    await createInnovationProposal(ideas, {
      files: dependencies.files,
      ui: dependencies.ui,
      terminal: dependencies.terminalAdapter,
      clock: dependencies.clock,
    });

    expect(dependencies.ui.showErrorMessage).toHaveBeenCalledWith("No workspace folder open.");
    expect(dependencies.clock.now).not.toHaveBeenCalled();
    expect(dependencies.files.createDirectory).not.toHaveBeenCalled();
    expect(dependencies.terminalAdapter.createTerminal).not.toHaveBeenCalled();
  });

  it("orchestrates file, UI, and terminal adapters while tolerating directory errors", async () => {
    const dependencies = createDependencies();
    dependencies.files.createDirectory.mockRejectedValueOnce(new Error("already exists"));

    await createInnovationProposal(ideas, {
      files: dependencies.files,
      ui: dependencies.ui,
      terminal: dependencies.terminalAdapter,
      clock: dependencies.clock,
    });

    const directory = "/workspace/.github/innovations";
    const file = `${directory}/innovation-1700000000000.md`;
    expect(dependencies.files.joinPath.mock.calls).toEqual([
      ["/workspace", ".github", "innovations"],
      [directory, "innovation-1700000000000.md"],
    ]);
    expect(dependencies.files.joinPath.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.clock.now.mock.invocationCallOrder[0]
    );
    expect(dependencies.clock.now.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.files.joinPath.mock.invocationCallOrder[1]
    );
    expect(dependencies.files.createDirectory).toHaveBeenCalledWith(directory);
    expect(dependencies.files.writeTextFile).toHaveBeenCalledWith(
      file,
      expect.stringContaining("#### 1. Flow idea")
    );
    expect(dependencies.files.openTextDocument).toHaveBeenCalledWith(file);
    expect(dependencies.ui.showTextDocument).toHaveBeenCalledWith(`document:${file}`);
    expect(dependencies.ui.showInformationMessage).toHaveBeenCalledWith(
      `Innovation proposal saved to ${file}`,
      "Create Branch & PR",
      "Just Keep File"
    );
    expect(dependencies.clock.now.mock.results.map(({ value }) => value)).toEqual([
      1700000000000, 1700000000999,
    ]);
    expect(dependencies.terminalAdapter.createTerminal.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.clock.now.mock.invocationCallOrder[1]
    );
    expect(dependencies.terminal.sendText.mock.calls.map(([command]) => command)).toEqual([
      "git checkout -b innovation/1700000000999",
      `git add '${file}'`,
      "git commit -m '💡 Innovation Ideas: Flow idea'",
      "gh pr create --title '💡 Innovation Ideas: Flow idea' --body 'See innovation proposal file' --fill",
    ]);
  });

  it("keeps the file without generating a branch when that choice is selected", async () => {
    const dependencies = createDependencies();
    dependencies.ui.showInformationMessage.mockResolvedValueOnce("Just Keep File");

    await createInnovationProposal(ideas, {
      files: dependencies.files,
      ui: dependencies.ui,
      terminal: dependencies.terminalAdapter,
      clock: dependencies.clock,
    });

    expect(dependencies.clock.now).toHaveBeenCalledOnce();
    expect(dependencies.terminalAdapter.createTerminal).not.toHaveBeenCalled();
  });
});
