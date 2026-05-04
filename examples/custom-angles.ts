/**
 * Custom angles example — create and register custom innovation angles.
 *
 * Usage:
 *   npx tsx examples/custom-angles.ts
 *
 * Prerequisites:
 *   - GitHub CLI authenticated (`gh auth login`)
 *   - Core package built (`npm run build --workspace=packages/core`)
 */

import { investigate, generateForAngle, registerPlugin, listPlugins } from "@innovator/core";
import type { AnglePlugin, CustomAngle } from "@innovator/core/types";

// Define a custom angle with a prompt template
const ethicsAngle: CustomAngle = {
  id: "ethics-lens",
  name: "Ethics Lens",
  description:
    "Evaluate ideas through ethical frameworks — fairness, transparency, and societal impact",
  promptTemplate: `You are an ethics consultant analyzing innovations.

Given the subject: {{subject}}

Investigation context:
{{investigation}}

Generate 3-5 innovative ideas that prioritize:
- Fairness and equity across user groups
- Transparency and explainability
- Positive societal impact
- Privacy preservation

For each idea, provide a JSON object with:
- "title": concise title
- "description": 2-3 sentence explanation
- "ethicalBenefit": the primary ethical advantage

Respond with JSON: { "ideas": [...] }`,
  icon: "⚖️",
  author: "Example",
  version: "1.0.0",
  tags: ["ethics", "fairness", "responsible-ai"],
};

const circularEconomyAngle: CustomAngle = {
  id: "circular-economy",
  name: "Circular Economy",
  description: "Reimagine through reduce, reuse, recycle, and regenerate principles",
  promptTemplate: `You are a circular economy expert.

Given the subject: {{subject}}

Investigation context:
{{investigation}}

Generate 3-5 ideas applying circular economy principles:
- Eliminate waste by design
- Keep products and materials in use
- Regenerate natural systems

For each idea, provide:
- "title": concise title
- "description": 2-3 sentence explanation
- "circularPrinciple": which circular economy principle it applies

Respond with JSON: { "ideas": [...] }`,
  icon: "♻️",
  author: "Example",
  version: "1.0.0",
  tags: ["sustainability", "circular-economy"],
};

// Bundle into a plugin
const customPlugin: AnglePlugin = {
  id: "example.custom-angles",
  name: "Example Custom Angles",
  version: "1.0.0",
  description: "Ethics and Circular Economy innovation angles",
  type: "angle",
  angles: [ethicsAngle, circularEconomyAngle],
};

async function main() {
  const subject = process.argv[2] || "food delivery services";

  // Register the plugin
  registerPlugin(customPlugin);
  console.log(
    "📦 Registered plugins:",
    listPlugins()
      .map((p) => p.name)
      .join(", ")
  );

  // Run investigation
  console.log(`\n🔍 Investigating: "${subject}"\n`);
  const investigation = await investigate(subject);
  console.log("📋 Summary:", investigation.summary);

  // Generate ideas using our custom angles
  for (const angle of customPlugin.angles) {
    console.log(`\n${angle.icon ?? "🔸"} Running custom angle: ${angle.name}`);
    console.log(`   ${angle.description}\n`);

    const result = await generateForAngle(subject, angle.id, investigation);
    for (const idea of result.ideas) {
      console.log(`  • ${idea.title}: ${idea.description}`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
