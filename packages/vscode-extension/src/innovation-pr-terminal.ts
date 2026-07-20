export interface InnovationPrTerminal {
  show(): void;
  sendText(command: string): void;
}

export interface InnovationPrTerminalAdapter {
  createTerminal(name: string): InnovationPrTerminal;
}

export interface InnovationPrCommandInput {
  filePath: string;
  title: string;
}

export function emitInnovationPrCommands(
  adapter: InnovationPrTerminalAdapter,
  input: InnovationPrCommandInput,
  createBranchName: () => string
): void {
  const terminal = adapter.createTerminal("Innovator PR");
  const branchName = createBranchName();
  const safePath = input.filePath.replace(/'/g, "'\\''");
  const safeTitle = input.title.replace(/'/g, "'\\''");

  terminal.show();
  terminal.sendText(`git checkout -b ${branchName}`);
  terminal.sendText(`git add '${safePath}'`);
  terminal.sendText(`git commit -m '${safeTitle}'`);
  terminal.sendText(
    `gh pr create --title '${safeTitle}' --body 'See innovation proposal file' --fill`
  );
}
