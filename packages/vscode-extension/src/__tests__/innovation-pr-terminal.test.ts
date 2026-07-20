import { describe, expect, it, vi } from "vitest";
import { emitInnovationPrCommands } from "../innovation-pr-terminal.js";

describe("innovation PR terminal emission", () => {
  it("shows one terminal and emits all four current commands separately and in order", () => {
    const terminal = {
      show: vi.fn(),
      sendText: vi.fn((_command: string) => false),
    };
    const adapter = {
      createTerminal: vi.fn(() => terminal),
    };
    const createBranchName = vi.fn(() => "innovation/1700000000999");

    emitInnovationPrCommands(
      adapter,
      {
        filePath: "/workspace/O'Brien/innovation.md",
        title: "💡 Innovation Ideas: Builder's Choice",
      },
      createBranchName
    );

    expect(adapter.createTerminal).toHaveBeenCalledWith("Innovator PR");
    expect(adapter.createTerminal.mock.invocationCallOrder[0]).toBeLessThan(
      createBranchName.mock.invocationCallOrder[0]
    );
    expect(terminal.show).toHaveBeenCalledOnce();
    expect(terminal.sendText.mock.calls.map(([command]) => command)).toEqual([
      "git checkout -b innovation/1700000000999",
      "git add '/workspace/O'\\''Brien/innovation.md'",
      "git commit -m '💡 Innovation Ideas: Builder'\\''s Choice'",
      "gh pr create --title '💡 Innovation Ideas: Builder'\\''s Choice' --body 'See innovation proposal file' --fill",
    ]);
  });
});
