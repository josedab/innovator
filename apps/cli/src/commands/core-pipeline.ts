import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  investigate,
  generateForAngle,
  runAutoPipeline,
  ANGLES,
  ANGLE_IDS,
  MAX_CONCURRENCY,
  scoreIdeas,
  getQuadrant,
  rankIdeas,
  extractContent,
  validateIdeas,
  transformForAudience,
  OUTPUT_MODES,
  runChain,
  getChainById,
  listChains,
  detectLanguage,
  SupportedLanguageSchema,
  getDepthConfig,
  suggestDepth,
  DepthSchema,
  parsePipelineRequest,
  resolveAngles,
  runInnovationDiff,
  evaluateConstraints,
  flattenIdeas,
  parseConstraintString,
  scoreInvestigationQuality,
  meetsConfidenceThreshold,
  formatGapSuggestions,
  generatePlaybook,
  runDebate,
  debateToMarkdown,
  runEvolution,
  evolutionToMarkdown,
  generateDecisionPacket,
  decisionPacketToMarkdown,
  generateStressScenarios,
  stressTestToMarkdown,
  simulateStakeholdersBatch,
  computeReadinessScores,
  createIaCSession,
  sessionFileName,
  enrichSynthesisWithNovelty,
  createFederationNode,
  enrichAngleSelection,
  listNodes,
} from "@innovator/core";
import type { AngleId, ValidationCheck, OutputMode, Depth, Constraint } from "@innovator/core";
import type { CliContext } from "../cli-context.js";
import { createCommandHelpers } from "../command-helpers.js";
import { stripAnsi } from "../utils.js";

export function registerCorePipelineCommands(program: Command, context: CliContext): void {
  const { validateSubjectWithLog, validateModelWithLog, debugLog, timeStart } =
    createCommandHelpers(context);

  // ---- investigate command ----
  // Performs AI-powered investigation on a subject, identifying key aspects,
  // challenges, opportunities, and current state. Supports depth tiers,
  // multilingual output, and context enrichment from files or URLs.
  program
    .command("investigate")
    .description("Investigate a subject to identify key aspects, challenges, and opportunities")
    .argument("<subject>", "The subject to investigate")
    .option("-m, --model <model>", "LLM model to use")
    .option("--depth <depth>", "Investigation depth: shallow, standard, or deep", "standard")
    .option("--lang <language>", "Output language: en, es, ja, de, pt")
    .option("--score", "Score and rank ideas after generation")
    .option("--file <path>", "Use a file or directory as context input")
    .option("--url <url>", "Use a URL as context input")
    .option("--save", "Save investigation result to .innovator/sessions/")
    /** Handler: investigate a subject and display structured findings. */
    .action(
      async (
        subject: string,
        opts: {
          model?: string;
          depth?: string;
          lang?: string;
          score?: boolean;
          file?: string;
          url?: string;
          save?: boolean;
        }
      ) => {
        if (!validateSubjectWithLog(subject)) return;
        if (!validateModelWithLog(opts.model)) return;

        // Validate depth option
        const depthParse = DepthSchema.safeParse(opts.depth ?? "standard");
        if (!depthParse.success) {
          context.output.error(
            chalk.red(`Invalid depth: ${opts.depth}. Use: shallow, standard, or deep`)
          );
          process.exitCode = 1;
          return;
        }
        const depth: Depth = depthParse.data;
        const depthConfig = getDepthConfig(depth);

        // Show depth info
        const suggestedDepth = suggestDepth(subject);
        if (suggestedDepth !== depth && depth === "standard") {
          context.output.log(
            chalk.dim(
              `💡 Suggested depth for this subject: ${suggestedDepth} (use --depth ${suggestedDepth})`
            )
          );
        }
        context.output.log(
          chalk.dim(`📐 Depth: ${depthConfig.label} — ${depthConfig.description}`)
        );
        context.output.log(
          chalk.dim(
            `⏱️  Estimated: ${depthConfig.estimatedTimeSeconds}s, ~${depthConfig.estimatedCalls} LLM call(s)\n`
          )
        );

        // Handle --file or --url input
        let enrichedSubject = subject;
        if (opts.file || opts.url) {
          const source = opts.file ?? opts.url!;
          const extractSpinner = ora(`Extracting content from ${source}...`).start();
          try {
            const extracted = await extractContent(source);
            enrichedSubject = `${subject}\n\nCONTEXT FROM ${extracted.sourceType.toUpperCase()} "${extracted.title}":\n${extracted.content.slice(0, 5000)}`;
            extractSpinner.succeed(
              `Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`
            );
          } catch (err) {
            extractSpinner.fail("Content extraction failed");
            context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
            process.exitCode = 1;
            return;
          }
        }

        const spinner = ora(`Investigating "${subject}"...`).start();
        debugLog("COMMAND", "investigate", { subject, model: opts.model });
        const endTimer = timeStart("investigate");

        try {
          const result = await investigate(enrichedSubject, opts.model);
          endTimer();
          spinner.succeed("Investigation complete!\n");
          debugLog("RESPONSE", JSON.stringify(result, null, 2));

          context.output.log(chalk.bold.blue("📋 Summary"));
          context.output.log(`   ${stripAnsi(result.summary)}\n`);

          context.output.log(chalk.bold.blue("🔑 Key Aspects"));
          for (const aspect of result.keyAspects) {
            context.output.log(
              `   ${chalk.bold(stripAnsi(aspect.title))}: ${stripAnsi(aspect.description)}`
            );
          }
          context.output.log();

          context.output.log(chalk.bold.blue("🎯 Current State"));
          context.output.log(`   ${stripAnsi(result.currentState)}\n`);

          context.output.log(chalk.bold.yellow("⚠️  Challenges"));
          for (const c of result.challenges) {
            context.output.log(`   ${chalk.yellow("•")} ${stripAnsi(c)}`);
          }
          context.output.log();

          context.output.log(chalk.bold.green("✨ Opportunities"));
          for (const o of result.opportunities) {
            context.output.log(`   ${chalk.green("•")} ${stripAnsi(o)}`);
          }
          context.output.log();

          context.output.log(chalk.dim("Available angles:"));
          for (const angle of ANGLES) {
            context.output.log(
              `   ${angle.icon} ${chalk.bold(angle.id)} — ${angle.shortDescription}`
            );
          }
          context.output.log(
            chalk.dim(`\nRun: innovator innovate "${subject}" --angles scamper,first-principles`)
          );

          // Save session if --save flag is set
          if (opts.save) {
            const sessionsDir = ".innovator/sessions";
            if (!existsSync(sessionsDir)) {
              mkdirSync(sessionsDir, { recursive: true });
            }
            const session = createIaCSession({
              subject,
              investigation: result,
              angleResults: [],
              model: opts.model,
            });
            const filename = sessionFileName(session);
            const filepath = `${sessionsDir}/${filename}`;
            writeFileSync(filepath, JSON.stringify(session, null, 2));
            context.output.log(chalk.green(`\n💾 Session saved: ${filepath}`));
          }
        } catch (err) {
          spinner.fail("Investigation failed");
          if (context.verbose) {
            context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          } else {
            context.output.error(chalk.red("Investigation failed. Use --verbose for details."));
          }
          process.exitCode = 1;
        }
      }
    );

  // ---- innovate command ----
  // Generates innovation ideas for a subject by applying selected creativity
  // angles (e.g., SCAMPER, First Principles). Requires a prior investigation
  // step (run automatically). Supports file/URL context and optional scoring.
  program
    .command("innovate")
    .description("Generate innovations for a subject using selected angles")
    .argument("<subject>", "The subject to innovate on")
    .requiredOption(
      "-a, --angles <angles>",
      "Comma-separated angle IDs (e.g., scamper,inversion,what-if)"
    )
    .option("-m, --model <model>", "LLM model to use")
    .option("--score", "Score and rank ideas after generation")
    .option("--file <path>", "Use a file or directory as context input")
    .option("--url <url>", "Use a URL as context input")
    /** Handler: generate innovation ideas for selected angles and display results. */
    .action(
      async (
        subject: string,
        opts: { angles: string; model?: string; score?: boolean; file?: string; url?: string }
      ) => {
        if (!validateSubjectWithLog(subject)) return;
        if (!validateModelWithLog(opts.model)) return;

        // Handle --file or --url input
        let enrichedSubject = subject;
        if (opts.file || opts.url) {
          const source = opts.file ?? opts.url!;
          const extractSpinner = ora(`Extracting content from ${source}...`).start();
          try {
            const extracted = await extractContent(source);
            enrichedSubject = `${subject}\n\nCONTEXT FROM ${extracted.sourceType.toUpperCase()} "${extracted.title}":\n${extracted.content.slice(0, 5000)}`;
            extractSpinner.succeed(
              `Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`
            );
          } catch (err) {
            extractSpinner.fail("Content extraction failed");
            context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
            process.exitCode = 1;
            return;
          }
        }

        const angleIds = opts.angles.split(",").map((a) => a.trim()) as AngleId[];
        const invalid = angleIds.filter((a) => !(ANGLE_IDS as readonly string[]).includes(a));
        if (invalid.length) {
          context.output.error(chalk.red(`Unknown angles: ${invalid.join(", ")}`));
          context.output.log(chalk.dim(`Valid angles: ${ANGLE_IDS.join(", ")}`));
          process.exitCode = 1;
          return;
        }

        const spinner = ora(`Investigating "${subject}"...`).start();
        debugLog("COMMAND", "innovate", { subject, angles: angleIds, model: opts.model });

        try {
          const endInvestigate = timeStart("investigate");
          const investigation = await investigate(enrichedSubject, opts.model);
          endInvestigate();
          spinner.succeed("Investigation complete");
          debugLog("RESPONSE", "investigation", JSON.stringify(investigation, null, 2));

          for (let i = 0; i < angleIds.length; i += MAX_CONCURRENCY) {
            const batch = angleIds.slice(i, i + MAX_CONCURRENCY);
            const batchResults = await Promise.all(
              batch.map(async (angleId) => {
                const angle = ANGLES.find((a) => a.id === angleId);
                if (!angle) {
                  throw new Error(`Unknown angle: ${angleId}`);
                }
                spinner.start(`${angle.icon} Generating: ${angle.name}...`);

                const endAngle = timeStart(`generate:${angleId}`);
                const result = await generateForAngle(subject, investigation, angleId, opts.model);
                endAngle();
                debugLog("RESPONSE", angleId, JSON.stringify(result, null, 2));
                return { angle, result };
              })
            );
            for (const { angle, result } of batchResults) {
              spinner.succeed(`${angle.icon} ${angle.name}`);
              context.output.log(chalk.dim(`   Reasoning: ${stripAnsi(result.reasoning)}`));
              for (const idea of result.ideas) {
                context.output.log(`\n   ${chalk.bold.cyan(stripAnsi(idea.title))}`);
                context.output.log(`   ${stripAnsi(idea.description)}`);
                context.output.log(`   ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}`);
                context.output.log(
                  `   ${chalk.dim("How to start:")} ${stripAnsi(idea.implementationHint)}`
                );
              }
              context.output.log();
            }
          }
        } catch (err) {
          spinner.fail("Innovation generation failed");
          if (context.verbose) {
            context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          } else {
            context.output.error(
              chalk.red("Innovation generation failed. Use --verbose for details.")
            );
          }
          process.exitCode = 1;
        }
      }
    );

  // ---- auto command ----
  // Runs the full innovation pipeline end-to-end: investigate → generate ideas
  // across all (or selected) angles → synthesize results. Supports optional
  // debate, stress testing, stakeholder simulation, and decision packet generation.
  program
    .command("auto")
    .description("Run full innovation pipeline automatically (all angles + synthesis)")
    .argument("<subject>", "The subject to innovate on")
    .option("-m, --model <model>", "LLM model to use")
    .option("--depth <depth>", "Investigation depth: shallow, standard, or deep", "standard")
    .option("--lang <language>", "Output language: en, es, ja, de, pt")
    .option("--score", "Score and rank ideas after generation")
    .option("--validate", "Validate ideas against patent, market, and feasibility checks")
    .option(
      "--audience <mode>",
      "Generate audience-adapted output (executive, technical, pitch, research)"
    )
    .option("--file <path>", "Use a file or directory as context input")
    .option("--url <url>", "Use a URL as context input")
    .option("--constraint <expr...>", "Apply constraints (e.g., 'budget<50K', 'timeline<3months')")
    .option(
      "--min-confidence <score>",
      "Minimum investigation confidence score (0-100) before generating ideas"
    )
    .option("--playbook [format]", "Generate an Innovation Playbook (markdown or html)")
    .option("--debate", "Run structured debate on top ideas after synthesis")
    .option("--debate-rounds <n>", "Number of debate rounds (1-5)", "2")
    .option("--decision-packet", "Generate an executive decision packet from results")
    .option("--stress-test", "Run stress test scenarios on top ideas")
    .option("--stakeholders", "Run stakeholder simulation on top ideas")
    .option("--save", "Save session to .innovator/sessions/ for version control")
    .option("--network-insights", "Enrich pipeline with Innovation Genome Network insights")
    .option("--novelty", "Score synthesized ideas for novelty against prior art")
    /** Handler: run the full auto-pipeline (investigate → generate → synthesize). */
    .action(
      async (
        subject: string,
        opts: {
          model?: string;
          depth?: string;
          lang?: string;
          score?: boolean;
          validate?: boolean;
          audience?: string;
          file?: string;
          url?: string;
          constraint?: string[];
          minConfidence?: string;
          playbook?: string | boolean;
          debate?: boolean;
          debateRounds?: string;
          decisionPacket?: boolean;
          stressTest?: boolean;
          stakeholders?: boolean;
          save?: boolean;
          networkInsights?: boolean;
          novelty?: boolean;
        }
      ) => {
        if (!validateSubjectWithLog(subject)) return;
        if (!validateModelWithLog(opts.model)) return;

        // Auto-detect or validate language
        const detectedLang = opts.lang ?? detectLanguage(subject);
        const langParse = SupportedLanguageSchema.safeParse(detectedLang);
        if (opts.lang && !langParse.success) {
          context.output.error(
            chalk.red(`Invalid language: ${opts.lang}. Supported: en, es, ja, de, pt`)
          );
          process.exitCode = 1;
          return;
        }
        if (detectedLang !== "en") {
          context.output.log(
            chalk.dim(`🌐 Language: ${detectedLang}${!opts.lang ? " (auto-detected)" : ""}`)
          );
        }

        // Validate and display depth info
        const depthParse = DepthSchema.safeParse(opts.depth ?? "standard");
        if (!depthParse.success) {
          context.output.error(
            chalk.red(`Invalid depth: ${opts.depth}. Use: shallow, standard, or deep`)
          );
          process.exitCode = 1;
          return;
        }
        const depth: Depth = depthParse.data;
        const depthConfig = getDepthConfig(depth);
        context.output.log(
          chalk.dim(`📐 Depth: ${depthConfig.label} — ${depthConfig.description}`)
        );
        context.output.log(
          chalk.dim(
            `⏱️  Estimated: ${depthConfig.estimatedTimeSeconds}s, ~${depthConfig.estimatedCalls} LLM call(s)\n`
          )
        );

        // Handle --file or --url input
        let enrichedSubject = subject;
        if (opts.file || opts.url) {
          const source = opts.file ?? opts.url!;
          const extractSpinner = ora(`Extracting content from ${source}...`).start();
          try {
            const extracted = await extractContent(source);
            enrichedSubject = `${subject}\n\nCONTEXT FROM ${extracted.sourceType.toUpperCase()} "${extracted.title}":\n${extracted.content.slice(0, 5000)}`;
            extractSpinner.succeed(
              `Extracted content from ${extracted.title} (${extracted.metadata.wordCount} words)`
            );
          } catch (err) {
            extractSpinner.fail("Content extraction failed");
            context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
            process.exitCode = 1;
            return;
          }
        }

        const spinner = ora("Starting auto pipeline...").start();
        debugLog("COMMAND", "auto", { subject, model: opts.model });
        const endTimer = timeStart("auto-pipeline");
        const pipelineStartMs = Date.now();

        // Network insights enrichment
        if (opts.networkInsights) {
          try {
            const allNodes = listNodes();
            if (allNodes.length === 0) {
              createFederationNode({ name: "local-cli", isPublic: false });
            }
            const nodeId = listNodes()[0].id;
            const enrichment = enrichAngleSelection(nodeId, [...ANGLE_IDS], undefined);
            if (enrichment.enrichments.length > 0) {
              spinner.info("🌐 Network insights applied:");
              for (const msg of enrichment.enrichments) context.output.log(`   ${msg}`);
              spinner.start("Starting auto pipeline...");
            }
          } catch {
            // Network unavailable — continue without enrichment
          }
        }

        const controller = new AbortController();
        context.commandCleanup = async () => controller.abort();

        try {
          const result = await runAutoPipeline(
            enrichedSubject,
            (progress) => {
              debugLog("PIPELINE", progress.stage, {
                completedAngles: progress.completedAngles.length,
                totalAngles: progress.totalAngles,
              });
              if (progress.stage === "investigating") {
                spinner.text = "🔍 Investigating subject...";
              } else if (progress.stage === "generating") {
                const done = progress.completedAngles.length;
                const total = progress.totalAngles;
                spinner.text = `⚡ Generating innovations... (${done}/${total})`;
              } else if (progress.stage === "synthesizing") {
                spinner.text = "🧪 Synthesizing results...";
              }
            },
            opts.model,
            undefined,
            controller.signal
          );

          if (result.stage === "error") {
            endTimer();
            spinner.fail("Pipeline failed");
            if (context.verbose) {
              context.output.error(chalk.red(result.error));
            } else {
              context.output.error(chalk.red("Pipeline failed. Use --verbose for details."));
            }
            process.exitCode = 1;
            return;
          }

          endTimer();
          spinner.succeed("Pipeline complete!\n");
          debugLog("RESPONSE", "pipeline complete", {
            anglesCompleted: result.angleResults.length,
            hasSynthesis: !!result.synthesis,
          });

          // Print angle results
          for (const angle of result.angleResults) {
            context.output.log(chalk.bold(`\n${"═".repeat(60)}`));
            context.output.log(chalk.bold.blue(`${stripAnsi(angle.angleName)}`));
            context.output.log(chalk.dim(stripAnsi(angle.reasoning)));

            for (const idea of angle.ideas) {
              context.output.log(`\n  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
              context.output.log(`  ${stripAnsi(idea.description)}`);
              context.output.log(`  ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}`);
              context.output.log(`  ${chalk.dim("Start:")} ${stripAnsi(idea.implementationHint)}`);
            }
          }

          // Print synthesis
          if (result.synthesis) {
            context.output.log(chalk.bold(`\n${"═".repeat(60)}`));
            context.output.log(chalk.bold.magenta("🏆 SYNTHESIS & TOP IDEAS\n"));

            for (const idea of result.synthesis.topIdeas) {
              const feasColor =
                idea.feasibility === "high"
                  ? chalk.green
                  : idea.feasibility === "medium"
                    ? chalk.yellow
                    : chalk.red;
              context.output.log(
                `  ${chalk.bold(stripAnsi(idea.title))} ${feasColor(`[${idea.feasibility}]`)}`
              );
              context.output.log(`  ${stripAnsi(idea.description)}`);
              context.output.log(
                `  ${chalk.dim("From:")} ${stripAnsi(idea.sourceAngle)} • ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}\n`
              );
            }

            context.output.log(chalk.bold("\n🔗 Themes:"));
            for (const theme of result.synthesis.themes) {
              context.output.log(`  ${chalk.magenta("•")} ${stripAnsi(theme)}`);
            }

            context.output.log(chalk.bold("\n📌 Recommendation:"));
            context.output.log(`  ${stripAnsi(result.synthesis.recommendation)}`);
          }

          // Save session to .innovator/sessions/ if --save flag is set
          if (opts.save) {
            const sessionsDir = ".innovator/sessions";
            if (!existsSync(sessionsDir)) {
              mkdirSync(sessionsDir, { recursive: true });
            }
            const session = createIaCSession({
              subject: enrichedSubject,
              investigation: result.investigation,
              angleResults: result.angleResults,
              synthesis: result.synthesis,
              model: opts.model,
              durationMs: Date.now() - pipelineStartMs,
            });
            const filename = sessionFileName(session);
            const filepath = `${sessionsDir}/${filename}`;
            writeFileSync(filepath, JSON.stringify(session, null, 2));
            context.output.log(chalk.green(`\n💾 Session saved: ${filepath}`));
          }

          // Novelty scoring if --novelty flag is set
          if (opts.novelty && result.synthesis) {
            const enriched = enrichSynthesisWithNovelty(result.synthesis);
            context.output.log(chalk.bold(`\n🆕 Novelty Scores`));
            context.output.log(
              `   Average: ${enriched.noveltyStats.averageNovelty}/100 | Highly Novel: ${enriched.noveltyStats.highlyNovel} | Patent Candidates: ${enriched.noveltyStats.patentCandidates}\n`
            );
            for (const idea of enriched.topIdeas) {
              const badge =
                idea.noveltyAssessment === "highly-novel"
                  ? chalk.green("🆕")
                  : idea.noveltyAssessment === "partially-novel"
                    ? chalk.yellow("🔶")
                    : chalk.red("⚠️");
              context.output.log(
                `   ${badge} ${chalk.bold(stripAnsi(idea.title))} — ${idea.noveltyScore}/100 ${idea.patentCandidate ? chalk.cyan("📋 Patent Candidate") : ""}`
              );
              if (idea.differentiators.length > 0) {
                context.output.log(
                  `      Differentiators: ${idea.differentiators.slice(0, 5).join(", ")}`
                );
              }
            }
            context.output.log();
          }

          // Check investigation confidence if --min-confidence flag is set
          if (opts.minConfidence && result.investigation) {
            const minConf = parseInt(opts.minConfidence, 10);
            if (isNaN(minConf) || minConf < 0 || minConf > 100) {
              context.output.error(chalk.red("Invalid --min-confidence value. Use 0-100."));
            } else {
              const confSpinner = ora("📊 Scoring investigation quality...").start();
              try {
                const confidence = await scoreInvestigationQuality(
                  subject,
                  result.investigation,
                  opts.model
                );
                const passes = meetsConfidenceThreshold(confidence, minConf);
                if (passes) {
                  confSpinner.succeed(
                    `Investigation confidence: ${confidence.overallScore}/100 ✓\n`
                  );
                } else {
                  confSpinner.warn(
                    `Investigation confidence: ${confidence.overallScore}/100 (below ${minConf} threshold)\n`
                  );
                }

                for (const dim of confidence.dimensions) {
                  const color =
                    dim.score >= 70 ? chalk.green : dim.score >= 50 ? chalk.yellow : chalk.red;
                  context.output.log(
                    `  ${color(`${dim.score}`)} ${dim.name}: ${stripAnsi(dim.explanation)}`
                  );
                }

                const gaps = formatGapSuggestions(confidence);
                if (gaps.length > 0) {
                  context.output.log(chalk.bold.yellow("\n  💡 Knowledge Gaps:"));
                  for (const gap of gaps) {
                    context.output.log(`    ${chalk.yellow("→")} ${stripAnsi(gap)}`);
                  }
                }
                context.output.log();
              } catch (err) {
                confSpinner.fail("Confidence scoring failed");
                if (context.verbose) {
                  context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
                }
              }
            }
          }

          // Score ideas if --score flag is set
          if (opts.score && result.angleResults.length > 0) {
            const scoreSpinner = ora("📊 Scoring ideas...").start();
            try {
              const scoring = await scoreIdeas(
                subject,
                result.angleResults,
                result.investigation,
                opts.model
              );
              scoreSpinner.succeed("Ideas scored!\n");

              const ranked = rankIdeas(scoring.scores);
              context.output.log(chalk.bold.blue("📊 PRIORITY MATRIX\n"));
              context.output.log(
                chalk.dim(
                  "  " +
                    "Idea".padEnd(40) +
                    "Feasibility".padEnd(14) +
                    "Impact".padEnd(9) +
                    "Novelty".padEnd(10) +
                    "Time".padEnd(10) +
                    "Quadrant"
                )
              );
              context.output.log(chalk.dim("  " + "─".repeat(90)));
              for (const score of ranked) {
                const quadrant = getQuadrant(score);
                const quadrantColor =
                  quadrant === "quick-wins"
                    ? chalk.green
                    : quadrant === "strategic-bets"
                      ? chalk.yellow
                      : quadrant === "low-hanging-fruit"
                        ? chalk.cyan
                        : chalk.dim;
                const title = stripAnsi(score.ideaTitle).slice(0, 38).padEnd(40);
                context.output.log(
                  `  ${title}${String(score.feasibility).padEnd(14)}${String(score.impact).padEnd(9)}${String(score.novelty).padEnd(10)}${score.timeToImplement.padEnd(10)}${quadrantColor(quadrant)}`
                );
              }
              context.output.log();
            } catch (err) {
              scoreSpinner.fail("Scoring failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }

          // Validate ideas if --validate flag is set
          if (opts.validate && result.angleResults.length > 0) {
            const allIdeas = result.angleResults.flatMap((ar) => ar.ideas);
            const validateSpinner = ora(`🔍 Validating ${allIdeas.length} ideas...`).start();
            try {
              const scorecard = await validateIdeas(allIdeas, subject, opts.model);
              validateSpinner.succeed("Ideas validated!\n");

              context.output.log(chalk.bold.blue("🔍 VALIDATION SCORECARD\n"));
              context.output.log(
                chalk.dim(
                  "  " +
                    "Idea".padEnd(40) +
                    "Score".padEnd(8) +
                    "Status".padEnd(20) +
                    "Patent".padEnd(10) +
                    "Market".padEnd(10) +
                    "Feasibility"
                )
              );
              context.output.log(chalk.dim("  " + "─".repeat(95)));
              for (const vr of scorecard.results) {
                const statusColor =
                  vr.overallStatus === "validated"
                    ? chalk.green
                    : vr.overallStatus === "caution"
                      ? chalk.yellow
                      : vr.overallStatus === "risky"
                        ? chalk.red
                        : chalk.dim;
                const title = stripAnsi(vr.ideaTitle).slice(0, 38).padEnd(40);
                const patent = vr.checks.find((c: ValidationCheck) => c.category === "patent");
                const market = vr.checks.find((c: ValidationCheck) => c.category === "competitor");
                const feasibility = vr.checks.find(
                  (c: ValidationCheck) => c.category === "feasibility"
                );
                context.output.log(
                  `  ${title}${String(vr.overallScore).padEnd(8)}${statusColor(vr.overallStatus.padEnd(20))}${(patent?.status ?? "n/a").padEnd(10)}${(market?.status ?? "n/a").padEnd(10)}${feasibility?.status ?? "n/a"}`
                );
              }
              context.output.log(`\n  ${chalk.dim(scorecard.summary)}\n`);
            } catch (err) {
              validateSpinner.fail("Validation failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }

          // Generate audience-adapted output if --audience flag is set
          if (opts.audience && result.synthesis) {
            const validModes = OUTPUT_MODES as readonly string[];
            if (!validModes.includes(opts.audience)) {
              context.output.error(
                chalk.red(
                  `Unknown audience mode: ${opts.audience}. Valid: ${OUTPUT_MODES.join(", ")}`
                )
              );
            } else {
              const audienceSpinner = ora(`📝 Generating ${opts.audience} output...`).start();
              try {
                const output = await transformForAudience(
                  result.synthesis,
                  opts.audience as OutputMode,
                  subject,
                  result.investigation,
                  opts.model
                );
                audienceSpinner.succeed(`${opts.audience} output generated!\n`);
                context.output.log(
                  chalk.bold.blue(`📝 ${output.modeName} (for ${output.audience})\n`)
                );
                context.output.log(JSON.stringify(output.content, null, 2));
                context.output.log();
              } catch (err) {
                audienceSpinner.fail("Audience output generation failed");
                if (context.verbose) {
                  context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
                }
              }
            }
          }

          // Evaluate constraints if --constraint flags are set
          if (opts.constraint && opts.constraint.length > 0 && result.angleResults.length > 0) {
            const constraintSpinner = ora("🔒 Evaluating constraints...").start();
            try {
              const constraints: Constraint[] = opts.constraint.map((c) =>
                parseConstraintString(c)
              );
              const ideas = flattenIdeas(result.angleResults);
              const constraintResult = await evaluateConstraints(ideas, constraints, opts.model);
              constraintSpinner.succeed("Constraints evaluated!\n");

              context.output.log(chalk.bold.blue("🔒 CONSTRAINT EVALUATION\n"));
              for (const evaluation of constraintResult.evaluations) {
                const passIcon = evaluation.passes ? chalk.green("✓") : chalk.red("✗");
                context.output.log(
                  `  ${passIcon} ${chalk.bold(stripAnsi(evaluation.ideaTitle))} — score: ${evaluation.score}/100`
                );
                for (const cr of evaluation.constraintResults) {
                  const crIcon = cr.satisfied ? chalk.green("  ✓") : chalk.red("  ✗");
                  context.output.log(
                    `    ${crIcon} ${stripAnsi(cr.dimension)}: ${stripAnsi(cr.explanation)}`
                  );
                }
              }
              context.output.log(`\n  ${chalk.dim(stripAnsi(constraintResult.summary))}\n`);
            } catch (err) {
              constraintSpinner.fail("Constraint evaluation failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }

          // Run debate on top ideas if --debate flag is set
          if (opts.debate && result.synthesis && result.synthesis.topIdeas.length > 0) {
            const debateRounds = Math.min(
              5,
              Math.max(1, parseInt(opts.debateRounds ?? "2", 10) || 2)
            );
            const topIdeas = result.synthesis.topIdeas.slice(0, 3);
            const debateSpinner = ora(
              `🗣️  Debating top ${topIdeas.length} ideas (${debateRounds} rounds)...`
            ).start();
            try {
              for (const topIdea of topIdeas) {
                debateSpinner.text = `🗣️  Debating: ${stripAnsi(topIdea.title)}...`;
                const debateResult = await runDebate(
                  {
                    title: topIdea.title,
                    description: topIdea.description,
                    potentialImpact: topIdea.potentialImpact,
                    implementationHint: "",
                  },
                  result.investigation,
                  { rounds: debateRounds, model: opts.model, signal: controller.signal }
                );
                context.output.log(chalk.bold(`\n${"═".repeat(60)}`));
                context.output.log(debateToMarkdown(debateResult));
              }
              debateSpinner.succeed("Debates complete!\n");
            } catch (err) {
              debateSpinner.fail("Debate failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }

          // Run stress test on top ideas if --stress-test flag is set
          if (opts.stressTest && result.synthesis && result.synthesis.topIdeas.length > 0) {
            const topIdeas = result.synthesis.topIdeas.slice(0, 3);
            const stressSpinner = ora(`🔥 Stress testing ${topIdeas.length} ideas...`).start();
            try {
              for (const topIdea of topIdeas) {
                stressSpinner.text = `🔥 Stress testing: ${stripAnsi(topIdea.title)}...`;
                const stressResult = await generateStressScenarios(
                  {
                    title: topIdea.title,
                    description: topIdea.description,
                    potentialImpact: topIdea.potentialImpact,
                    implementationHint: "",
                  },
                  subject,
                  { model: opts.model, signal: controller.signal }
                );
                context.output.log(chalk.bold(`\n${"═".repeat(60)}`));
                context.output.log(stressTestToMarkdown(stressResult));
              }
              stressSpinner.succeed("Stress tests complete!\n");
            } catch (err) {
              stressSpinner.fail("Stress test failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }

          // Generate playbook if --playbook flag is set
          if (opts.playbook && result.investigation && result.synthesis) {
            const format =
              typeof opts.playbook === "string" && opts.playbook === "html"
                ? ("html" as const)
                : ("markdown" as const);
            const playbookSpinner = ora(`📕 Generating Innovation Playbook (${format})...`).start();
            try {
              const playbook = await generatePlaybook(
                subject,
                result.investigation,
                result.angleResults,
                result.synthesis,
                format,
                opts.model
              );
              playbookSpinner.succeed("Innovation Playbook generated!\n");

              const filename = `playbook-${subject
                .slice(0, 30)
                .replace(/[^a-z0-9]/gi, "-")
                .toLowerCase()}.${format === "html" ? "html" : "md"}`;
              const fs = await import("node:fs");
              fs.writeFileSync(filename, playbook.content, "utf-8");
              context.output.log(chalk.green(`  📄 Saved to ${filename}`));
              context.output.log(
                chalk.dim(
                  `  ${playbook.content.length} characters, ${playbook.sections.roadmap.length} phases, ${playbook.sections.risks.length} risks\n`
                )
              );
            } catch (err) {
              playbookSpinner.fail("Playbook generation failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }

          // Generate decision packet if --decision-packet flag is set
          if (opts.decisionPacket && result.investigation && result.synthesis) {
            const packetSpinner = ora("📋 Generating Executive Decision Packet...").start();
            try {
              const packet = await generateDecisionPacket(
                result.synthesis,
                result.investigation,
                subject,
                { model: opts.model, signal: controller.signal }
              );
              packetSpinner.succeed("Decision Packet generated!\n");

              const md = decisionPacketToMarkdown(packet);
              const filename = `decision-packet-${subject
                .slice(0, 30)
                .replace(/[^a-z0-9]/gi, "-")
                .toLowerCase()}.md`;
              const fs = await import("node:fs");
              fs.writeFileSync(filename, md, "utf-8");
              context.output.log(chalk.green(`  📄 Saved to ${filename}`));
              context.output.log(
                chalk.dim(
                  `  ${packet.options.length} options, ${packet.risks.length} risks, ${packet.resourceAsk.length} resources\n`
                )
              );
            } catch (err) {
              packetSpinner.fail("Decision packet generation failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }

          // Run stakeholder simulation if --stakeholders flag is set
          if (opts.stakeholders && result.synthesis && result.synthesis.topIdeas.length > 0) {
            const topIdeas = result.synthesis.topIdeas.slice(0, 5);
            const stakeholderSpinner = ora(
              `👥 Simulating stakeholder reactions for ${topIdeas.length} ideas...`
            ).start();
            try {
              const ideas = topIdeas.map((ti) => ({
                title: ti.title,
                description: ti.description,
                potentialImpact: ti.potentialImpact,
                implementationHint: "",
              }));
              const simulations = await simulateStakeholdersBatch(
                ideas,
                undefined,
                opts.model,
                controller.signal
              );
              stakeholderSpinner.succeed("Stakeholder simulation complete!\n");

              const matrices = computeReadinessScores(simulations);

              context.output.log(chalk.bold.blue("👥 STAKEHOLDER SIMULATION\n"));
              for (const sim of simulations) {
                context.output.log(chalk.bold(`  ${stripAnsi(sim.ideaTitle)}`));
                context.output.log(
                  chalk.dim("  " + "Persona".padEnd(25) + "Enthusiasm".padEnd(14) + "Likely Action")
                );
                context.output.log(chalk.dim("  " + "─".repeat(65)));
                for (const r of sim.reactions) {
                  const color =
                    r.enthusiasm >= 7 ? chalk.green : r.enthusiasm >= 4 ? chalk.yellow : chalk.red;
                  context.output.log(
                    `  ${stripAnsi(r.personaName).padEnd(25)}${color(String(r.enthusiasm) + "/10").padEnd(14)}${stripAnsi(r.likelyAction)}`
                  );
                }
                context.output.log(
                  chalk.dim(
                    `  Consensus: ${sim.consensusScore}/10 | Most enthusiastic: ${sim.mostEnthusiastic} | Most concerned: ${sim.mostConcerned}\n`
                  )
                );
              }

              context.output.log(chalk.bold.blue("📊 READINESS SCORES\n"));
              context.output.log(
                chalk.dim(
                  "  " +
                    "Idea".padEnd(40) +
                    "Readiness".padEnd(12) +
                    "Alignment".padEnd(12) +
                    "Support/Oppose/Neutral"
                )
              );
              context.output.log(chalk.dim("  " + "─".repeat(85)));
              for (const m of matrices) {
                const readColor =
                  m.readinessScore >= 70
                    ? chalk.green
                    : m.readinessScore >= 40
                      ? chalk.yellow
                      : chalk.red;
                const title = stripAnsi(m.ideaTitle).slice(0, 38).padEnd(40);
                context.output.log(
                  `  ${title}${readColor(`${m.readinessScore}%`).padEnd(12)}${String(Math.round(m.alignmentScore * 100) + "%").padEnd(12)}${m.supportCount}/${m.oppositionCount}/${m.neutralCount}`
                );
              }
              context.output.log();
            } catch (err) {
              stakeholderSpinner.fail("Stakeholder simulation failed");
              if (context.verbose) {
                context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
              }
            }
          }
        } catch {
        } finally {
          context.commandCleanup = null;
        }
      }
    );

  // ---- evolve command ----
  // Evolves ideas through genetic-algorithm-inspired selection, crossover,
  // and mutation over multiple generations to discover high-fitness innovations.
  program
    .command("evolve")
    .description("Evolve ideas through genetic-algorithm-inspired mutation and crossover")
    .argument("<subject>", "The subject to evolve ideas for")
    .option("-m, --model <model>", "LLM model to use")
    .option("--generations <n>", "Number of evolution generations (1-10)", "3")
    .option("--population <n>", "Population size per generation", "6")
    /** Handler: evolve ideas through genetic-algorithm-inspired generations. */
    .action(
      async (
        subject: string,
        opts: { model?: string; generations?: string; population?: string }
      ) => {
        if (!validateSubjectWithLog(subject)) return;
        if (!validateModelWithLog(opts.model)) return;

        const gens = Math.min(10, Math.max(1, parseInt(opts.generations ?? "3", 10) || 3));
        const popSize = Math.min(20, Math.max(4, parseInt(opts.population ?? "6", 10) || 6));

        const spinner = ora("🔍 Investigating subject for initial population...").start();
        const controller = new AbortController();
        context.commandCleanup = async () => controller.abort();

        try {
          const investigation = await investigate(subject, opts.model, controller.signal);
          spinner.succeed("Investigation complete");

          spinner.start("⚡ Generating initial idea population...");
          const angleResult = await generateForAngle(
            subject,
            investigation,
            "first-principles",
            opts.model,
            controller.signal
          );
          spinner.succeed(`Generated ${angleResult.ideas.length} seed ideas`);

          spinner.start(`🧬 Evolving over ${gens} generations (pop: ${popSize})...`);
          const result = await runEvolution(
            angleResult.ideas,
            gens,
            { populationSize: popSize, model: opts.model, signal: controller.signal },
            (progress) => {
              spinner.text = `🧬 Gen ${progress.generation + 1}/${progress.totalGenerations} — best fitness: ${progress.bestFitness} (${progress.phase})`;
            }
          );
          spinner.succeed("Evolution complete!\n");

          context.output.log(evolutionToMarkdown(result));
        } catch (err) {
          spinner.fail("Evolution failed");
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        } finally {
          context.commandCleanup = null;
        }
      }
    );

  // ---- diff command ----
  // Compares two temporal snapshots of a subject to identify what changed,
  // new opportunities, obsoleted aspects, and emerging gaps.
  program
    .command("diff")
    .description("Compare two snapshots of a subject and generate an innovation diff")
    .argument("<subjectA>", "First snapshot (e.g., 'remote work in 2020')")
    .argument("<subjectB>", "Second snapshot (e.g., 'remote work in 2026')")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: compare two temporal snapshots and display innovation diff. */
    .action(async (subjectA: string, subjectB: string, opts: { model?: string }) => {
      if (!validateModelWithLog(opts.model)) return;

      const spinner = ora(`Comparing "${subjectA}" vs "${subjectB}"...`).start();
      debugLog("COMMAND", "diff", { subjectA, subjectB, model: opts.model });

      try {
        const result = await runInnovationDiff(subjectA, subjectB, opts.model);
        spinner.succeed("Innovation diff complete!\n");

        context.output.log(chalk.bold.blue(`📊 ${result.subjectA} → ${result.subjectB}\n`));
        context.output.log(chalk.bold(`📋 Summary`));
        context.output.log(`  ${stripAnsi(result.summary)}\n`);

        context.output.log(chalk.bold.yellow("🔄 What Changed"));
        for (const item of result.changed) {
          const sig =
            item.significance === "high"
              ? chalk.red("●")
              : item.significance === "medium"
                ? chalk.yellow("●")
                : chalk.dim("●");
          context.output.log(`  ${sig} ${chalk.bold(stripAnsi(item.title))}`);
          context.output.log(`    ${stripAnsi(item.description)}`);
        }

        context.output.log(chalk.bold.green("\n✨ New Opportunities"));
        for (const item of result.newOpportunities) {
          context.output.log(`  ${chalk.green("•")} ${chalk.bold(stripAnsi(item.title))}`);
          context.output.log(`    ${stripAnsi(item.description)}`);
        }

        context.output.log(chalk.bold.red("\n🗑️  Obsoleted"));
        for (const item of result.obsoleted) {
          context.output.log(`  ${chalk.red("•")} ${chalk.bold(stripAnsi(item.title))}`);
          context.output.log(`    ${stripAnsi(item.description)}`);
        }

        context.output.log(chalk.bold.magenta("\n🔍 Emerging Gaps"));
        for (const item of result.emergingGaps) {
          context.output.log(`  ${chalk.magenta("•")} ${chalk.bold(stripAnsi(item.title))}`);
          context.output.log(`    ${stripAnsi(item.description)}`);
        }
        context.output.log();
      } catch (err) {
        spinner.fail("Innovation diff failed");
        if (context.verbose) {
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        } else {
          context.output.error(chalk.red("Diff failed. Use --verbose for details."));
        }
        process.exitCode = 1;
      }
    });

  // ---- run (natural language pipeline) command ----
  // Accepts a plain-English description of an innovation pipeline, parses it
  // into a structured execution plan, and runs the resolved pipeline steps.
  program
    .command("run")
    .description("Run a pipeline described in natural language")
    .argument("<description>", "Plain English description of what pipeline to run")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: parse and execute a natural-language pipeline description. */
    .action(async (description: string, opts: { model?: string }) => {
      if (!validateModelWithLog(opts.model)) return;

      const parseSpinner = ora("Parsing pipeline description...").start();
      debugLog("COMMAND", "run", { description, model: opts.model });

      try {
        const config = await parsePipelineRequest(description, opts.model);
        parseSpinner.succeed("Pipeline configuration parsed");

        context.output.log(chalk.dim(`  Subject: ${config.subject}`));
        context.output.log(chalk.dim(`  Phases: ${config.phases.join(" → ")}`));
        if (config.angles) context.output.log(chalk.dim(`  Angles: ${config.angles.join(", ")}`));
        if (config.outputFormat) context.output.log(chalk.dim(`  Format: ${config.outputFormat}`));
        if (config.focusArea) context.output.log(chalk.dim(`  Focus: ${config.focusArea}`));
        context.output.log();

        if (!validateSubjectWithLog(config.subject)) return;

        const angles = resolveAngles(config);
        const spinner = ora("Running pipeline...").start();
        const controller = new AbortController();
        context.commandCleanup = async () => controller.abort();

        const result = await runAutoPipeline(
          config.subject,
          (progress) => {
            if (progress.stage === "investigating") spinner.text = "🔍 Investigating subject...";
            else if (progress.stage === "generating") {
              const done = progress.completedAngles.length;
              spinner.text = `⚡ Generating innovations... (${done}/${progress.totalAngles})`;
            } else if (progress.stage === "synthesizing")
              spinner.text = "🧪 Synthesizing results...";
          },
          config.model ?? opts.model,
          angles,
          controller.signal
        );

        if (result.stage === "error") {
          spinner.fail("Pipeline failed");
          context.output.error(chalk.red(result.error ?? "Unknown error"));
          process.exitCode = 1;
          return;
        }

        spinner.succeed("Pipeline complete!\n");

        for (const angle of result.angleResults) {
          context.output.log(chalk.bold.blue(`\n${stripAnsi(angle.angleName)}`));
          for (const idea of angle.ideas) {
            context.output.log(`  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
            context.output.log(`  ${stripAnsi(idea.description)}`);
          }
        }

        if (result.synthesis) {
          context.output.log(chalk.bold.magenta("\n🏆 TOP IDEAS\n"));
          for (const idea of result.synthesis.topIdeas) {
            context.output.log(`  ${chalk.bold(stripAnsi(idea.title))} [${idea.feasibility}]`);
            context.output.log(`  ${stripAnsi(idea.description)}\n`);
          }
          context.output.log(chalk.bold("\n📌 Recommendation:"));
          context.output.log(`  ${stripAnsi(result.synthesis.recommendation)}`);
        }
      } catch (err) {
        parseSpinner.fail("Pipeline failed");
        if (context.verbose) {
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        } else {
          context.output.error(chalk.red("Pipeline failed. Use --verbose for details."));
        }
        process.exitCode = 1;
      } finally {
        context.commandCleanup = null;
      }
    });

  // ---- chain command ----
  // Runs pre-defined angle chains that compose multiple angles sequentially,
  // passing output from one angle as input to the next.
  const chainCmd = program
    .command("chain")
    .description("Run pre-defined angle chains for composed innovation");

  chainCmd
    .command("list")
    .description("List available angle chains")
    /** Handler: list all available angle chains. */
    .action(() => {
      context.output.log(chalk.bold("\n🔗 Available Angle Chains\n"));
      for (const chain of listChains()) {
        context.output.log(`  ${chalk.bold.cyan(chain.id)} — ${chain.name}`);
        context.output.log(`  ${chalk.dim(chain.description)}`);
        context.output.log(`  Steps: ${chain.steps.map((s) => s.angleId).join(" → ")}\n`);
      }
    });

  chainCmd
    .command("run")
    .description("Run an angle chain")
    .argument("<chainId>", "Chain ID to run (e.g., deep-disruption)")
    .argument("<subject>", "The subject to innovate on")
    .option("-m, --model <model>", "LLM model to use")
    /** Handler: execute an angle chain on a subject. */
    .action(async (chainId: string, subject: string, opts: { model?: string }) => {
      if (!validateSubjectWithLog(subject)) return;
      if (!validateModelWithLog(opts.model)) return;

      const chain = getChainById(chainId);
      if (!chain) {
        context.output.error(chalk.red(`Unknown chain: ${chainId}`));
        context.output.log(
          chalk.dim(
            `Available chains: ${listChains()
              .map((c) => c.id)
              .join(", ")}`
          )
        );
        process.exitCode = 1;
        return;
      }

      context.output.log(chalk.bold(`\n🔗 Running chain: ${chain.name}`));
      context.output.log(chalk.dim(`${chain.description}`));
      context.output.log(chalk.dim(`Steps: ${chain.steps.map((s) => s.angleId).join(" → ")}\n`));

      const spinner = ora(`Investigating "${subject}"...`).start();
      const controller = new AbortController();
      context.commandCleanup = async () => controller.abort();

      try {
        const investigation = await investigate(subject, opts.model, controller.signal);
        spinner.succeed("Investigation complete");

        const results = await runChain(
          chain,
          subject,
          investigation,
          (progress) => {
            spinner.start(
              `⚡ Step ${progress.currentStep}/${progress.totalSteps}: ${progress.currentAngleId}...`
            );
          },
          opts.model,
          controller.signal
        );

        spinner.succeed("Chain complete!\n");

        for (let i = 0; i < results.length; i++) {
          const step = chain.steps[i];
          const result = results[i];
          context.output.log(chalk.bold(`\n${"═".repeat(60)}`));
          context.output.log(
            chalk.bold.blue(`Step ${i + 1}: ${stripAnsi(result.angleName)}`) +
              (step.contextFilter ? chalk.dim(` (filter: ${step.contextFilter})`) : "")
          );
          context.output.log(chalk.dim(stripAnsi(result.reasoning)));

          for (const idea of result.ideas) {
            context.output.log(`\n  ${chalk.bold.cyan(stripAnsi(idea.title))}`);
            context.output.log(`  ${stripAnsi(idea.description)}`);
            context.output.log(`  ${chalk.dim("Impact:")} ${stripAnsi(idea.potentialImpact)}`);
            context.output.log(`  ${chalk.dim("Start:")} ${stripAnsi(idea.implementationHint)}`);
          }
        }
      } catch (err) {
        spinner.fail("Chain execution failed");
        if (context.verbose) {
          context.output.error(chalk.red(err instanceof Error ? err.message : String(err)));
        } else {
          context.output.error(chalk.red("Chain execution failed. Use --verbose for details."));
        }
        process.exitCode = 1;
      } finally {
        context.commandCleanup = null;
      }
    });
}
