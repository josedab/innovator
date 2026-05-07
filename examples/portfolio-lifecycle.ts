/**
 * Portfolio lifecycle example — track ideas from generation to outcome.
 *
 * Demonstrates the portfolio module for idea lifecycle management
 * and the scaffolding module for idea-to-code generation.
 *
 * Usage:
 *   npx tsx examples/portfolio-lifecycle.ts
 *
 * Prerequisites:
 *   - GitHub CLI authenticated (`gh auth login`)
 *   - Core package built (`npm run build --workspace=packages/core`)
 */

import {
  investigate,
  generateForAngle,
  scoreIdeas,
  addPortfolioItem,
  transitionItem,
  getPortfolioMetrics,
  generateScaffold,
  scaffoldToMarkdown,
} from "@innovator/core";

async function main() {
  const subject = process.argv[2] || "developer productivity tools";

  // Stage 1: Generate and score ideas
  console.log(`\n🔍 Investigating: "${subject}"\n`);
  const investigation = await investigate(subject);

  console.log("⚡ Generating ideas with SCAMPER...\n");
  const angleResult = await generateForAngle(subject, investigation, "scamper");

  console.log("📊 Scoring ideas...\n");
  const scored = await scoreIdeas(subject, [angleResult], investigation);

  if (scored.scores.length === 0) {
    console.error("No scores were generated. Try a different subject.");
    process.exit(1);
  }

  console.log("Scored Ideas:");
  for (const score of scored.scores.slice(0, 3)) {
    const icon = score.feasibility >= 7 ? "🟢" : "🟡";
    console.log(
      `  ${icon} ${score.ideaTitle} — feasibility: ${score.feasibility}, impact: ${score.impact}`
    );
  }

  // Stage 2: Add top ideas to portfolio
  console.log("\n📁 Adding to portfolio...\n");
  const addedItems = [];
  for (const score of scored.scores.slice(0, 3)) {
    const item = addPortfolioItem({
      title: score.ideaTitle,
      description: score.rationale,
      sourceAngle: "scamper",
    });
    addedItems.push(item);
    console.log(`  ✅ Added: ${item.title} (stage: ${item.stage})`);
  }

  // Stage 3: Advance top idea through stages
  const topItem = addedItems[0];
  console.log(`\n🚀 Advancing "${topItem.title}" through lifecycle...\n`);

  transitionItem(topItem.id, "evaluation", "High scoring idea");
  console.log("  → Evaluation");

  transitionItem(topItem.id, "prototyping", "Passed feasibility review");
  console.log("  → Prototyping");

  // Stage 4: Generate implementation scaffolding
  if (angleResult.ideas.length === 0) {
    console.error("No ideas were generated. Skipping scaffolding.");
    process.exit(1);
  }
  const topIdea = angleResult.ideas[0];
  console.log("\n🏗️  Generating implementation scaffolding...\n");
  const scaffold = generateScaffold({ idea: topIdea });

  console.log("  📂 Generated structure:");
  for (const file of scaffold.files.slice(0, 5)) {
    console.log(`     ${file.path} — ${file.description}`);
  }
  if (scaffold.files.length > 5) {
    console.log(`     ... and ${scaffold.files.length - 5} more files`);
  }

  console.log(`\n  📋 Issues to create: ${scaffold.issues.length}`);
  console.log(`  🏗️  Tech stack: ${scaffold.techStack.join(", ")}`);

  // Stage 5: Portfolio metrics
  console.log("\n📈 Portfolio Metrics:\n");
  const metrics = getPortfolioMetrics();
  console.log(`  Total ideas: ${metrics.totalIdeas}`);
  console.log(`  Ship rate: ${(metrics.conversionRates.overallShipRate * 100).toFixed(1)}%`);
  console.log(`  Velocity: ${metrics.velocityPerWeek.toFixed(1)} ideas/week`);
  console.log(
    `  By stage:`,
    Object.entries(metrics.byStage)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
