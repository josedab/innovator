/**
 * Debate and Red Team example — generate ideas, then stress-test them.
 *
 * Demonstrates the debate engine for multi-perspective analysis and
 * the red team module for adversarial idea testing.
 *
 * Usage:
 *   npx tsx examples/debate-and-redteam.ts
 *
 * Prerequisites:
 *   - GitHub CLI authenticated (`gh auth login`)
 *   - Core package built (`npm run build --workspace=packages/core`)
 */

import {
  investigate,
  generateForAngle,
  runDebate,
  runRedTeamSession,
  type InnovationIdea,
} from "@innovator/core";

async function main() {
  const subject = process.argv[2] || "AI-powered code review tools";

  // Stage 1: Investigate and generate ideas
  console.log(`\n🔍 Investigating: "${subject}"\n`);
  const investigation = await investigate(subject);
  console.log("📋 Summary:", investigation.summary);

  console.log("\n⚡ Generating ideas with First Principles...\n");
  const result = await generateForAngle(subject, investigation, "first-principles");

  for (const idea of result.ideas) {
    console.log(`  💡 ${idea.title}`);
  }

  // Pick the first idea for deeper analysis
  const topIdea: InnovationIdea = result.ideas[0];
  console.log(`\n🏆 Focusing on: "${topIdea.title}"\n`);

  // Stage 2: Debate the idea from pro/con perspectives
  console.log("🎭 Running structured debate...\n");
  const debate = await runDebate(topIdea, investigation, { rounds: 2 });

  for (const round of debate.rounds) {
    console.log(`  Round ${round.round}:`);
    console.log(
      `    🟢 Pro: ${round.proArguments
        .map((a) => a.point)
        .join("; ")
        .slice(0, 120)}...`
    );
    console.log(
      `    🔴 Con: ${round.conArguments
        .map((a) => a.point)
        .join("; ")
        .slice(0, 120)}...`
    );
  }
  console.log(`\n  📝 Verdict: [${debate.verdict.winner}] ${debate.verdict.summary}`);

  // Stage 3: Red team the idea for weaknesses
  console.log("\n🔴 Red teaming the top idea...\n");
  const session = await runRedTeamSession(topIdea, investigation, {
    rounds: 2,
    onRoundComplete: (round, attack) => {
      console.log(`  Round ${round}:`);
      for (const finding of attack.findings) {
        console.log(`    ⚠️  [${finding.severity}] ${finding.title}`);
      }
      console.log(`    Survival score: ${attack.survivalScore}/10`);
    },
  });

  console.log(`\n  🏁 Final verdict: ${session.finalVerdict}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
