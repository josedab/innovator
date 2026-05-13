/**
 * @module copilot-extension/manifest
 *
 * GitHub App manifest and Copilot Extension metadata for Marketplace listing.
 */

/** Manifest describing the Copilot Extension's identity, commands, and permissions. */
export interface ExtensionManifest {
  /** Display name shown in GitHub Copilot Chat. */
  name: string;
  /** Short description for the Marketplace listing. */
  description: string;
  /** Semantic version of the extension. */
  version: string;
  /** Emoji icon displayed alongside the extension name. */
  icon: string;
  /** Slash commands the extension responds to. */
  commands: ExtensionCommand[];
  /** GitHub App permissions required by the extension. */
  permissions: string[];
  /** GitHub webhook events the extension subscribes to. */
  events: string[];
  /** Homepage URL for the extension. */
  homepage: string;
  /** Source code repository URL. */
  repository: string;
}

/** A single slash command exposed by the Copilot Extension. */
export interface ExtensionCommand {
  /** Slash command name (without the leading slash). */
  name: string;
  /** Human-readable description shown in command palette. */
  description: string;
  /** Optional parameters the command accepts. */
  parameters?: ExtensionParameter[];
}

/** Parameter definition for an extension command. */
export interface ExtensionParameter {
  /** Parameter name as used in the command syntax. */
  name: string;
  /** Human-readable description of the parameter. */
  description: string;
  /** Whether the parameter is required. */
  required: boolean;
  /** Expected value type. */
  type: "string" | "number" | "boolean";
}

export const EXTENSION_MANIFEST: ExtensionManifest = {
  name: "Innovator",
  description:
    "AI-powered innovation engine — investigate any subject from 8 creative angles and synthesize strategic recommendations",
  version: "0.1.0",
  icon: "💡",
  commands: [
    {
      name: "investigate",
      description: "Analyze a subject to identify key aspects, challenges, and opportunities",
      parameters: [
        {
          name: "subject",
          description: "The subject to investigate",
          required: true,
          type: "string",
        },
        { name: "model", description: "LLM model to use", required: false, type: "string" },
      ],
    },
    {
      name: "innovate",
      description: "Generate innovation ideas using specific angles",
      parameters: [
        {
          name: "subject",
          description: "The subject to innovate on",
          required: true,
          type: "string",
        },
        {
          name: "angles",
          description: "Comma-separated angle IDs",
          required: false,
          type: "string",
        },
      ],
    },
    {
      name: "auto",
      description: "Run all innovation angles and synthesize strategic recommendations",
      parameters: [
        {
          name: "subject",
          description: "The subject for full auto analysis",
          required: true,
          type: "string",
        },
      ],
    },
    {
      name: "angles",
      description: "List all available innovation angles",
    },
    {
      name: "presets",
      description: "Browse domain-specific innovation presets",
    },
    {
      name: "help",
      description: "Show available commands and usage instructions",
    },
  ],
  permissions: ["copilot"],
  events: ["copilot_chat"],
  homepage: "https://josedab.github.io/innovator",
  repository: "https://github.com/josedab/innovator",
};
