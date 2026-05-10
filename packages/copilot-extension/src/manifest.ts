/**
 * @module copilot-extension/manifest
 *
 * GitHub App manifest and Copilot Extension metadata for Marketplace listing.
 */

export interface ExtensionManifest {
  name: string;
  description: string;
  version: string;
  icon: string;
  commands: ExtensionCommand[];
  permissions: string[];
  events: string[];
  homepage: string;
  repository: string;
}

export interface ExtensionCommand {
  name: string;
  description: string;
  parameters?: ExtensionParameter[];
}

export interface ExtensionParameter {
  name: string;
  description: string;
  required: boolean;
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
