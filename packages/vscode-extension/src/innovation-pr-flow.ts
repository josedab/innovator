import type { InnovationIdea } from "@innovator/core/innovation" with {
  "resolution-mode": "import",
};
import {
  generateInnovationBranchName,
  generateInnovationProposal,
  generateInnovationProposalFileName,
} from "./innovation-proposal.js";
import {
  emitInnovationPrCommands,
  type InnovationPrTerminalAdapter,
} from "./innovation-pr-terminal.js";

export interface InnovationProposalFiles<Location, Document> {
  getWorkspaceRoot(): Location | undefined;
  joinPath(base: Location, ...segments: string[]): Location;
  getFileSystemPath(location: Location): string;
  createDirectory(location: Location): PromiseLike<void>;
  writeTextFile(location: Location, contents: string): PromiseLike<void>;
  openTextDocument(location: Location): PromiseLike<Document>;
}

export interface InnovationProposalUi<Document> {
  showTextDocument(document: Document): PromiseLike<unknown>;
  showErrorMessage(message: string): void;
  showInformationMessage(message: string, ...choices: string[]): PromiseLike<string | undefined>;
}

export interface InnovationProposalClock {
  now(): number;
}

export interface InnovationProposalDependencies<Location, Document> {
  files: InnovationProposalFiles<Location, Document>;
  ui: InnovationProposalUi<Document>;
  terminal: InnovationPrTerminalAdapter;
  clock: InnovationProposalClock;
}

export async function createInnovationProposal<Location, Document>(
  ideas: InnovationIdea[],
  dependencies: InnovationProposalDependencies<Location, Document>
): Promise<void> {
  const { files, ui, terminal, clock } = dependencies;
  const proposal = generateInnovationProposal(ideas);
  const workspaceRoot = files.getWorkspaceRoot();
  if (!workspaceRoot) {
    ui.showErrorMessage("No workspace folder open.");
    return;
  }
  const directory = files.joinPath(workspaceRoot, ".github", "innovations");
  const file = files.joinPath(directory, generateInnovationProposalFileName(clock.now()));

  try {
    await files.createDirectory(directory);
  } catch {
    // Directory may already exist
  }
  await files.writeTextFile(file, proposal.body);

  const document = await files.openTextDocument(file);
  await ui.showTextDocument(document);

  const createPR = await ui.showInformationMessage(
    `Innovation proposal saved to ${files.getFileSystemPath(file)}`,
    "Create Branch & PR",
    "Just Keep File"
  );

  if (createPR === "Create Branch & PR") {
    emitInnovationPrCommands(
      terminal,
      {
        filePath: files.getFileSystemPath(file),
        title: proposal.title,
      },
      () => generateInnovationBranchName(clock.now())
    );
  }
}
