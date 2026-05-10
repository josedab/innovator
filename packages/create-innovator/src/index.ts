#!/usr/bin/env node

/**
 * create-innovator — scaffold a new Innovator project.
 *
 * Usage:
 *   npx create-innovator          (interactive)
 *   npx create-innovator my-proj  (with project name)
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import chalk from "chalk";

// ---- Interactive Prompt Helper ----

function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

async function confirm(question: string): Promise<boolean> {
  const answer = await ask(`${question} (y/N)`);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

// ---- Config Templates ----

interface ScaffoldConfig {
  projectName: string;
  defaultProvider: string;
  setupCopilot: boolean;
  includePresets: boolean;
  includeCustomAngles: boolean;
}

function generateConfig(config: ScaffoldConfig): string {
  return JSON.stringify(
    {
      defaultProvider: config.defaultProvider,
      providers: {
        copilot: { enabled: true },
        openai: { enabled: false, apiKeyEnv: "OPENAI_API_KEY" },
        anthropic: { enabled: false, apiKeyEnv: "ANTHROPIC_API_KEY" },
        ollama: { enabled: false, baseUrl: "http://localhost:11434" },
      },
      modelPreferences: {
        investigation: null,
        generation: null,
        synthesis: null,
      },
    },
    null,
    2
  );
}

function generateSampleAngle(): string {
  return JSON.stringify(
    {
      id: "my-custom-angle",
      name: "My Custom Angle",
      description: "A custom innovation angle for domain-specific analysis",
      promptTemplate: `You are an innovation expert. Analyze the following subject using your custom methodology.

SUBJECT: {{subject}}

CONTEXT:
{{investigation}}

Generate 3-5 innovative ideas based on your custom analysis. Respond with valid JSON:
{
  "angleId": "my-custom-angle",
  "angleName": "My Custom Angle",
  "ideas": [
    {
      "title": "Idea title",
      "description": "Detailed description",
      "potentialImpact": "Impact assessment",
      "implementationHint": "How to start"
    }
  ],
  "reasoning": "How this angle was applied"
}`,
      icon: "🎯",
      author: "Your Name",
      tags: ["custom"],
    },
    null,
    2
  );
}

function generateReadme(projectName: string): string {
  return `# ${projectName}

An [Innovator](https://github.com/innovator) project for AI-powered innovation.

## Quick Start

\`\`\`bash
# Install the CLI
npm install -g @innovator/cli

# Or use npx directly
npx innovator auto 'your subject here'
\`\`\`

## Configuration

Edit \`.innovator.config.json\` to customize providers, models, and preferences.

## Custom Angles

Add custom angle definitions in the \`angles/\` directory.
See \`angles/sample.angle.json\` for an example.

## Commands

\`\`\`bash
innovator investigate 'subject'     # Quick investigation
innovator auto 'subject'           # Full pipeline with synthesis
innovator chain run deep-disruption 'subject'  # Run an angle chain
innovator feedback summary          # View angle quality scores
\`\`\`
`;
}

// ---- Main ----

async function main() {
  const args = process.argv.slice(2);
  const projectName = args[0];

  console.log(chalk.bold("\n💡 create-innovator\n"));
  console.log(chalk.dim("Scaffold a new Innovator project\n"));

  const config: ScaffoldConfig = {
    projectName: projectName || (await ask("Project name", "my-innovator-project")),
    defaultProvider: await ask("Default LLM provider (copilot/openai/anthropic/ollama)", "copilot"),
    setupCopilot: await confirm("Set up GitHub Copilot token guidance?"),
    includePresets: await confirm("Include domain presets?"),
    includeCustomAngles: await confirm("Include sample custom angle?"),
  };

  const projectDir = resolve(process.cwd(), config.projectName);

  if (existsSync(projectDir)) {
    console.error(chalk.red(`\n❌ Directory "${config.projectName}" already exists.`));
    process.exit(1);
  }

  console.log(chalk.dim(`\nCreating project in ${projectDir}...\n`));

  // Create directory structure
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, "angles"), { recursive: true });

  // Write config
  writeFileSync(join(projectDir, ".innovator.config.json"), generateConfig(config), "utf-8");
  console.log(chalk.green("  ✓ .innovator.config.json"));

  // Write sample angle
  if (config.includeCustomAngles) {
    writeFileSync(join(projectDir, "angles", "sample.angle.json"), generateSampleAngle(), "utf-8");
    console.log(chalk.green("  ✓ angles/sample.angle.json"));
  }

  // Write README
  writeFileSync(join(projectDir, "README.md"), generateReadme(config.projectName), "utf-8");
  console.log(chalk.green("  ✓ README.md"));

  // Write .gitignore
  writeFileSync(join(projectDir, ".gitignore"), "node_modules/\n.env\n.env.local\n", "utf-8");
  console.log(chalk.green("  ✓ .gitignore"));

  // Copilot setup guidance
  if (config.setupCopilot) {
    console.log(chalk.bold("\n🔑 GitHub Copilot Setup:\n"));
    console.log(chalk.dim("  1. Ensure you have a GitHub Copilot subscription"));
    console.log(chalk.dim("  2. Run: gh auth login"));
    console.log(chalk.dim("  3. Run: gh extension install github/gh-copilot"));
    console.log(chalk.dim("  4. Verify: gh copilot --version\n"));
  }

  console.log(chalk.bold.green("\n✅ Project created successfully!\n"));
  console.log(chalk.dim("Next steps:"));
  console.log(`  cd ${config.projectName}`);
  console.log("  npx innovator auto 'your subject here'\n");
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
