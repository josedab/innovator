import * as vscode from "vscode";
import type {
  InnovationProposalClock,
  InnovationProposalFiles,
  InnovationProposalUi,
} from "./innovation-pr-flow.js";
import type { InnovationPrTerminalAdapter } from "./innovation-pr-terminal.js";

export const vscodeInnovationProposalFiles: InnovationProposalFiles<
  vscode.Uri,
  vscode.TextDocument
> = {
  getWorkspaceRoot() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return undefined;
    return workspaceFolders[0].uri;
  },
  joinPath(base, ...segments) {
    return vscode.Uri.joinPath(base, ...segments);
  },
  getFileSystemPath(location) {
    return location.fsPath;
  },
  createDirectory(location) {
    return vscode.workspace.fs.createDirectory(location);
  },
  writeTextFile(location, contents) {
    return vscode.workspace.fs.writeFile(location, Buffer.from(contents, "utf-8"));
  },
  openTextDocument(location) {
    return vscode.workspace.openTextDocument(location);
  },
};

export const vscodeInnovationProposalUi: InnovationProposalUi<vscode.TextDocument> = {
  showTextDocument(document) {
    return vscode.window.showTextDocument(document);
  },
  showErrorMessage(message) {
    void vscode.window.showErrorMessage(message);
  },
  showInformationMessage(message, ...choices) {
    return vscode.window.showInformationMessage(message, ...choices);
  },
};

export const vscodeInnovationPrTerminal: InnovationPrTerminalAdapter = {
  createTerminal(name) {
    return vscode.window.createTerminal(name);
  },
};

export const systemClock: InnovationProposalClock = {
  now: () => Date.now(),
};
