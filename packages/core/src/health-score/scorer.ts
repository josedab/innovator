/**
 * Innovation Health Score computation engine.
 * Computes a composite 0-100 score across 6 axes from codebase metrics.
 */
import type { HealthScore, AxisScore, HealthScoreInput, HealthAxis } from "./types.js";

const AXIS_WEIGHTS: Record<HealthAxis, number> = {
  "architectural-flexibility": 0.2,
  "dependency-freshness": 0.15,
  "test-coverage": 0.2,
  "documentation-completeness": 0.15,
  "community-activity": 0.15,
  "innovation-velocity": 0.15,
};

/** Compute the composite innovation health score. */
export function computeHealthScore(input: HealthScoreInput): HealthScore {
  const axes: AxisScore[] = [
    computeArchitecturalFlexibility(input),
    computeDependencyFreshness(input),
    computeTestCoverage(input),
    computeDocumentationCompleteness(input),
    computeCommunityActivity(input),
    computeInnovationVelocity(input),
  ];

  const overall = Math.round(axes.reduce((sum, a) => sum + a.score * AXIS_WEIGHTS[a.axis], 0));

  const sorted = [...axes].sort((a, b) => b.score - a.score);
  const topStrengths = sorted.slice(0, 2).map((a) => `${a.label}: ${a.details}`);
  const topWeaknesses = sorted
    .slice(-2)
    .reverse()
    .map((a) => `${a.label}: ${a.details}`);

  const improvementIdeas = axes
    .filter((a) => a.score < 70)
    .flatMap((a) => a.suggestions.slice(0, 2));

  const summary =
    overall >= 80
      ? "Excellent innovation health — this codebase is well-positioned for innovation."
      : overall >= 60
        ? "Good innovation health with room for improvement in some areas."
        : overall >= 40
          ? "Moderate innovation health — several areas need attention."
          : "Low innovation health — significant improvements needed before innovating effectively.";

  return {
    overall,
    axes,
    summary,
    topStrengths,
    topWeaknesses,
    improvementIdeas,
    analyzedAt: new Date().toISOString(),
  };
}

function computeArchitecturalFlexibility(input: HealthScoreInput): AxisScore {
  let score = 50; // Base score

  const layers = input.layers ?? [];
  const patterns = input.patterns ?? [];

  // More layers = better separation of concerns
  if (layers.length >= 4) score += 20;
  else if (layers.length >= 2) score += 10;

  // Penalize anti-patterns
  const antiPatterns = patterns.filter((p) => p.type === "anti-pattern");
  score -= Math.min(30, antiPatterns.length * 10);

  // Penalize high-severity issues
  const highSeverity = patterns.filter((p) => p.severity === "high");
  score -= Math.min(20, highSeverity.length * 5);

  // Balanced layer sizes indicate good architecture
  if (layers.length > 1) {
    const sizes = layers.map((l) => l.fileCount);
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const variance = sizes.reduce((a, b) => a + (b - avg) ** 2, 0) / sizes.length;
    const cv = Math.sqrt(variance) / Math.max(avg, 1);
    if (cv < 0.5) score += 10; // Well-balanced
  }

  score = clamp(score, 0, 100);

  const suggestions: string[] = [];
  if (antiPatterns.length > 0)
    suggestions.push("Refactor identified anti-patterns to improve flexibility");
  if (layers.length < 3)
    suggestions.push(
      "Introduce clearer architectural layers (e.g., domain, infrastructure, presentation)"
    );
  if (score < 60) suggestions.push("Consider applying dependency inversion to reduce coupling");

  return {
    axis: "architectural-flexibility",
    score,
    label: "Architectural Flexibility",
    details: `${layers.length} layers, ${antiPatterns.length} anti-patterns detected`,
    suggestions,
  };
}

function computeDependencyFreshness(input: HealthScoreInput): AxisScore {
  let score = 70; // Default if no data

  const deps = input.dependencies ?? [];
  if (deps.length === 0) {
    return {
      axis: "dependency-freshness",
      score: 70,
      label: "Dependency Freshness",
      details: "No dependency data available",
      suggestions: ["Provide package.json for dependency analysis"],
    };
  }

  const prodDeps = deps.filter((d) => d.type === "production");
  const devDeps = deps.filter((d) => d.type === "development");

  // Penalize many dependencies (indicates potential bloat)
  if (prodDeps.length > 50) score -= 15;
  else if (prodDeps.length > 30) score -= 5;

  // Check for pinned vs range versions
  const pinned = deps.filter(
    (d) => d.version && !d.version.includes("^") && !d.version.includes("~")
  );
  if (pinned.length > deps.length * 0.5) score -= 10; // Too many pinned = harder to update

  score = clamp(score, 0, 100);

  const suggestions: string[] = [];
  if (prodDeps.length > 30)
    suggestions.push("Audit production dependencies for unused or replaceable packages");
  if (pinned.length > deps.length * 0.5)
    suggestions.push("Use semver ranges for non-critical dependencies");

  return {
    axis: "dependency-freshness",
    score,
    label: "Dependency Freshness",
    details: `${prodDeps.length} prod deps, ${devDeps.length} dev deps`,
    suggestions,
  };
}

function computeTestCoverage(input: HealthScoreInput): AxisScore {
  const fileCount = input.fileCount ?? 0;
  const testCount = input.testFileCount ?? 0;

  if (fileCount === 0) {
    return {
      axis: "test-coverage",
      score: 0,
      label: "Test Coverage",
      details: "No files detected",
      suggestions: ["Provide file counts for test coverage analysis"],
    };
  }

  const testRatio = testCount / fileCount;
  let score: number;

  if (testRatio >= 0.5) score = 95;
  else if (testRatio >= 0.3) score = 80;
  else if (testRatio >= 0.15) score = 60;
  else if (testRatio >= 0.05) score = 40;
  else score = 20;

  const suggestions: string[] = [];
  if (testRatio < 0.15)
    suggestions.push("Increase test file coverage — aim for at least 1 test per module");
  if (testRatio < 0.3) suggestions.push("Add integration tests for critical user flows");
  if (testRatio < 0.5) suggestions.push("Consider property-based testing for core algorithms");

  return {
    axis: "test-coverage",
    score,
    label: "Test Coverage",
    details: `${testCount} test files out of ${fileCount} total (${Math.round(testRatio * 100)}%)`,
    suggestions,
  };
}

function computeDocumentationCompleteness(input: HealthScoreInput): AxisScore {
  const fileCount = input.fileCount ?? 0;
  const docCount = input.docFileCount ?? 0;
  const hasPackageJson = !!input.packageJson;

  let score = 30; // Base

  if (hasPackageJson) score += 10;
  if (docCount > 0) score += 20;
  if (docCount >= 5) score += 15;
  if (docCount >= 10) score += 10;

  // Doc ratio
  if (fileCount > 0) {
    const docRatio = docCount / fileCount;
    if (docRatio >= 0.1) score += 15;
    else if (docRatio >= 0.05) score += 10;
  }

  score = clamp(score, 0, 100);

  const suggestions: string[] = [];
  if (docCount === 0)
    suggestions.push("Add a README.md with setup instructions and architecture overview");
  if (docCount < 5) suggestions.push("Document API endpoints and key modules");
  if (!hasPackageJson)
    suggestions.push("Add package.json with description and scripts documentation");

  return {
    axis: "documentation-completeness",
    score,
    label: "Documentation Completeness",
    details: `${docCount} documentation files${hasPackageJson ? ", package.json present" : ""}`,
    suggestions,
  };
}

function computeCommunityActivity(input: HealthScoreInput): AxisScore {
  const commits = input.commitCount ?? 0;
  const contributors = input.contributorCount ?? 0;
  const openIssues = input.openIssues ?? 0;
  const lastCommit = input.lastCommitDate;

  let score = 40; // Base

  if (commits > 500) score += 20;
  else if (commits > 100) score += 15;
  else if (commits > 20) score += 10;

  if (contributors > 5) score += 15;
  else if (contributors > 1) score += 10;

  // Penalize many open issues (relative to activity)
  if (openIssues > 100) score -= 10;

  // Recent activity bonus
  if (lastCommit) {
    const daysSince = (Date.now() - new Date(lastCommit).getTime()) / 86_400_000;
    if (daysSince < 7) score += 15;
    else if (daysSince < 30) score += 10;
    else if (daysSince > 180) score -= 15;
  }

  score = clamp(score, 0, 100);

  const suggestions: string[] = [];
  if (contributors <= 1)
    suggestions.push(
      "Attract contributors with good-first-issue labels and contribution guidelines"
    );
  if (openIssues > 50)
    suggestions.push("Triage and close stale issues to signal active maintenance");

  return {
    axis: "community-activity",
    score,
    label: "Community Activity",
    details: `${commits} commits, ${contributors} contributors, ${openIssues} open issues`,
    suggestions,
  };
}

function computeInnovationVelocity(input: HealthScoreInput): AxisScore {
  const patterns = input.patterns ?? [];
  const layers = input.layers ?? [];
  const fileCount = input.fileCount ?? 0;

  let score = 50; // Base

  // Design patterns indicate thoughtful architecture
  const designPatterns = patterns.filter((p) => p.type === "design-pattern");
  score += Math.min(20, designPatterns.length * 5);

  // Complexity hotspots slow innovation
  const hotspots = patterns.filter((p) => p.type === "complexity-hotspot");
  score -= Math.min(20, hotspots.length * 7);

  // Large codebases with good structure score higher
  if (fileCount > 100 && layers.length >= 3) score += 10;

  // Tech debt inhibits velocity
  const techDebt = patterns.filter((p) => p.type === "tech-debt");
  score -= Math.min(15, techDebt.length * 5);

  score = clamp(score, 0, 100);

  const suggestions: string[] = [];
  if (hotspots.length > 0)
    suggestions.push("Refactor complexity hotspots to enable faster feature development");
  if (techDebt.length > 0) suggestions.push("Allocate time for tech debt reduction sprints");
  if (designPatterns.length === 0)
    suggestions.push("Adopt design patterns for common problems to accelerate development");

  return {
    axis: "innovation-velocity",
    score,
    label: "Innovation Velocity",
    details: `${designPatterns.length} design patterns, ${hotspots.length} hotspots, ${techDebt.length} tech debt items`,
    suggestions,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
