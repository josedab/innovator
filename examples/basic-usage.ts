/**
 * Basic usage example — run the investigation and auto pipeline.
 *
 * Usage:
 *   npx tsx examples/basic-usage.ts
 *
 * Prerequisites:
 *   - GitHub CLI authenticated (`gh auth login`)
 *   - Core package built (`npm run build --workspace=packages/core`)
 */

import { investigate, runAutoPipeline, ANGLES } from "@innovator/core";

async function main() {
  const subject = process.argv[2] || "sustainable packaging";

  console.log(`\n🔍 Investigating: "${subject}"\n`);

  // Stage 1: Investigation
  const investigation = await investigate(subject);
  console.log("📋 Summary:", investigation.summary);
  console.log("📌 Key Aspects:", investigation.keyAspects.map((a) => a.title).join(", "));
  console.log("⚡ Challenges:", investigation.challenges.join("; "));
  console.log("💡 Opportunities:", investigation.opportunities.join("; "));

  // Stage 2: Full auto pipeline (all angles + synthesis)
  console.log(`\n🚀 Running auto pipeline with ${ANGLES.length} angles...\n`);

  const result = await runAutoPipeline(subject, {
    onProgress: (event) => {
      if (event.type === "angle-start") {
        console.log(`  ▶ Starting angle: ${event.angleId}`);
      } else if (event.type === "angle-complete") {
        console.log(`  ✅ Completed: ${event.angleId} (${event.ideas?.length ?? 0} ideas)`);
      }
    },
  });

  // Display results
  console.log("\n📊 Results:\n");
  for (const angleResult of result.angleResults) {
    console.log(`--- ${angleResult.angleId} ---`);
    for (const idea of angleResult.ideas) {
      console.log(`  • ${idea.title}: ${idea.description}`);
    }
    console.log();
  }

  if (result.synthesis) {
    console.log("🏆 Top Ideas:");
    for (const idea of result.synthesis.topIdeas ?? []) {
      console.log(`  ⭐ ${idea.title}`);
    }
    console.log(`\n📝 Recommendation: ${result.synthesis.recommendation}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
