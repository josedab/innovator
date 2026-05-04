/**
 * Budget management example — set cost caps and monitor token usage.
 *
 * Usage:
 *   npx tsx examples/with-budget.ts
 *
 * Prerequisites:
 *   - GitHub CLI authenticated (`gh auth login`)
 *   - Core package built (`npm run build --workspace=packages/core`)
 */

import {
  investigate,
  runAutoPipeline,
  getCostTracker,
  resetCostTracker,
  estimateCost,
  listModelPricing,
} from "@innovator/core";

async function main() {
  const subject = process.argv[2] || "telemedicine";
  const budgetUsd = parseFloat(process.argv[3] || "0.50");

  // Reset tracker for a clean session
  resetCostTracker();
  const tracker = getCostTracker();

  // Display available model pricing
  console.log("💰 Model Pricing:\n");
  for (const pricing of listModelPricing()) {
    console.log(
      `  ${pricing.modelId}: $${pricing.inputPer1k}/1K input, $${pricing.outputPer1k}/1K output`
    );
  }

  // Pre-flight cost estimate
  const estimatedAutoModeCost = estimateCost("gpt-4.1", 25000, 12000);
  console.log(`\n📊 Estimated auto pipeline cost (gpt-4.1): $${estimatedAutoModeCost.toFixed(4)}`);
  console.log(`💳 Budget cap: $${budgetUsd.toFixed(2)}\n`);

  // Set up budget with abort controller
  const abortController = new AbortController();
  tracker.setBudget({
    maxCostUsd: budgetUsd,
    abortController,
  });

  // Listen for budget exceeded
  abortController.signal.addEventListener("abort", () => {
    console.warn(`\n⚠️  Budget exceeded! Reason: ${abortController.signal.reason}`);
  });

  try {
    // Run the pipeline
    console.log(`🔍 Investigating: "${subject}"\n`);
    const investigation = await investigate(subject);
    console.log("📋 Summary:", investigation.summary);

    // Check cost after investigation
    console.log(`\n💰 Cost after investigation: $${tracker.getTotalCost().toFixed(4)}`);

    console.log("\n🚀 Running auto pipeline...\n");
    const result = await runAutoPipeline(subject, {
      onProgress: (event) => {
        if (event.type === "angle-complete") {
          const cost = tracker.getTotalCost();
          console.log(
            `  ✅ ${event.angleId} — running total: $${cost.toFixed(4)} / $${budgetUsd.toFixed(2)}`
          );
        }
      },
      signal: abortController.signal,
    });

    console.log(`\n✅ Pipeline complete! Generated ${result.angleResults.length} angle results.`);
  } catch (err) {
    if (abortController.signal.aborted) {
      console.log("\n🛑 Pipeline stopped due to budget limit.");
    } else {
      throw err;
    }
  }

  // Print final cost summary
  const summary = tracker.getSummary();
  console.log("\n" + "=".repeat(60));
  console.log("📊 COST SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total calls:    ${summary.callCount}`);
  console.log(`  Input tokens:   ${summary.totalInputTokens.toLocaleString()}`);
  console.log(`  Output tokens:  ${summary.totalOutputTokens.toLocaleString()}`);
  console.log(`  Total cost:     $${summary.totalCostUsd.toFixed(4)}`);
  console.log(`  Total latency:  ${(summary.totalLatencyMs / 1000).toFixed(1)}s`);

  if (Object.keys(summary.byModel).length > 0) {
    console.log("\n  By Model:");
    for (const [model, stats] of Object.entries(summary.byModel)) {
      console.log(`    ${model}: $${stats.costUsd.toFixed(4)} (${stats.calls} calls)`);
    }
  }

  if (Object.keys(summary.byStage).length > 0) {
    console.log("\n  By Stage:");
    for (const [stage, stats] of Object.entries(summary.byStage)) {
      console.log(`    ${stage}: $${stats.costUsd.toFixed(4)} (${stats.calls} calls)`);
    }
  }

  const budget = tracker.getBudget();
  if (budget) {
    const remaining = Math.max(0, budget.maxCostUsd - summary.totalCostUsd);
    console.log(
      `\n  Budget remaining: $${remaining.toFixed(4)} of $${budget.maxCostUsd.toFixed(2)}`
    );
  }

  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
