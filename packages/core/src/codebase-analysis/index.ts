/**
 * @module codebase-analysis
 *
 * AST-based codebase analysis for auto-generating innovation subjects.
 * Parses TypeScript/JavaScript source files to extract code patterns,
 * dependency relationships, architectural layers, and complexity metrics.
 * Generates structured innovation subjects from discovered patterns.
 */

import { z } from "zod";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

// ---- Schemas ----

/** Schema for a discovered code pattern. */
export const CodePatternSchema = z.object({
  type: z.enum([
    "design-pattern",
    "anti-pattern",
    "complexity-hotspot",
    "dependency-risk",
    "missing-abstraction",
    "tech-debt",
    "security-concern",
    "performance-bottleneck",
  ]),
  name: z.string().max(200),
  description: z.string().max(1000),
  locations: z.array(z.string().max(500)).max(50),
  severity: z.enum(["low", "medium", "high"]),
  innovationPotential: z.number().min(0).max(1),
});

/** Schema for a dependency analysis result. */
export const DependencyAnalysisSchema = z.object({
  name: z.string().max(200),
  version: z.string().max(50).optional(),
  type: z.enum(["production", "development", "peer"]),
  category: z.string().max(100),
  outdated: z.boolean().optional(),
  alternatives: z.array(z.string().max(200)).max(5).optional(),
});

/** Schema for an architectural layer discovered in the codebase. */
export const ArchitecturalLayerSchema = z.object({
  name: z.string().max(200),
  path: z.string().max(500),
  fileCount: z.number().min(0),
  responsibilities: z.array(z.string().max(500)).max(10),
  dependencies: z.array(z.string().max(200)).max(20),
});

/** Schema for a file complexity metric. */
export const FileComplexitySchema = z.object({
  path: z.string().max(500),
  lines: z.number().min(0),
  functions: z.number().min(0),
  exports: z.number().min(0),
  imports: z.number().min(0),
  complexityScore: z.number().min(0).max(100),
});

/** Schema for a generated innovation subject from codebase analysis. */
export const CodebaseSubjectSchema = z.object({
  subject: z.string().max(500),
  category: z.enum([
    "architecture",
    "developer-experience",
    "performance",
    "reliability",
    "security",
    "scalability",
    "maintainability",
    "testing",
    "automation",
  ]),
  rationale: z.string().max(1000),
  relevantPatterns: z.array(z.string().max(200)).max(10),
  priority: z.enum(["low", "medium", "high", "critical"]),
  estimatedImpact: z.string().max(500),
});

/** Schema for the full codebase analysis report. */
export const CodebaseAnalysisSchema = z.object({
  rootPath: z.string().max(500),
  analyzedAt: z.string(),
  fileCount: z.number().min(0),
  totalLines: z.number().min(0),
  languages: z.array(z.string().max(50)).max(20),
  patterns: z.array(CodePatternSchema).max(100),
  dependencies: z.array(DependencyAnalysisSchema).max(200),
  layers: z.array(ArchitecturalLayerSchema).max(50),
  complexityHotspots: z.array(FileComplexitySchema).max(50),
  subjects: z.array(CodebaseSubjectSchema).max(30),
});

// ---- Types ----

export type CodePattern = z.infer<typeof CodePatternSchema>;
export type DependencyAnalysis = z.infer<typeof DependencyAnalysisSchema>;
export type ArchitecturalLayer = z.infer<typeof ArchitecturalLayerSchema>;
export type FileComplexity = z.infer<typeof FileComplexitySchema>;
export type CodebaseSubject = z.infer<typeof CodebaseSubjectSchema>;
export type CodebaseAnalysis = z.infer<typeof CodebaseAnalysisSchema>;

/** Options for codebase analysis. */
export interface CodebaseAnalysisOptions {
  rootPath: string;
  /** Glob patterns to exclude (default: node_modules, dist, .git). */
  exclude?: string[];
  /** Maximum files to analyze (default: 500). */
  maxFiles?: number;
  /** Maximum file size in bytes to read (default: 100KB). */
  maxFileSize?: number;
  /** Generate AI-powered subjects (requires LLM). */
  generateSubjects?: boolean;
  /** LLM model override. */
  model?: string;
  /** Abort signal. */
  signal?: AbortSignal;
}

// ---- Constants ----

const DEFAULT_EXCLUDE = ["node_modules", "dist", "build", ".git", ".next", "coverage", "__pycache__", "vendor", "target"];
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".cs", ".swift", ".kt"]);
const MAX_FILES_DEFAULT = 500;
const MAX_FILE_SIZE_DEFAULT = 100 * 1024; // 100KB

// ---- File Discovery ----

/**
 * Recursively discover source files in a directory.
 */
export function discoverFiles(
  rootPath: string,
  exclude: string[] = DEFAULT_EXCLUDE,
  maxFiles: number = MAX_FILES_DEFAULT
): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (files.length >= maxFiles) return;
    if (!existsSync(dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (exclude.some((ex) => entry === ex || entry.startsWith("."))) continue;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (CODE_EXTENSIONS.has(extname(entry).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  walk(rootPath);
  return files;
}

// ---- AST-like Analysis (regex-based for zero-dependency) ----

/**
 * Analyze a single source file for complexity metrics.
 */
export function analyzeFile(
  filePath: string,
  maxSize: number = MAX_FILE_SIZE_DEFAULT
): FileComplexity | null {
  if (!existsSync(filePath)) return null;

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return null;
  }
  if (stat.size > maxSize) return null;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = content.split("\n").length;

  // Count function declarations (approximate AST analysis via regex)
  const functionPatterns = [
    /\bfunction\s+\w+/g,
    /\b(?:async\s+)?(?:function\s*\*?\s*\w*|\w+\s*(?:=|:)\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>)/g,
    /\b(?:def|func|fn)\s+\w+/g,
    /\b(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g,
  ];
  let functions = 0;
  for (const pattern of functionPatterns) {
    const matches = content.match(pattern);
    functions += matches?.length ?? 0;
  }

  // Count exports
  const exportMatches = content.match(/\bexport\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)/g);
  const exports = exportMatches?.length ?? 0;

  // Count imports
  const importMatches = content.match(/\b(?:import|require|from)\b/g);
  const imports = importMatches?.length ?? 0;

  // Complexity score: weighted combination of size, nesting, and coupling
  const nestingDepth = Math.max(...content.split("\n").map((l) => {
    const match = l.match(/^(\s*)/);
    return match ? match[1].length / 2 : 0;
  }));
  const complexityScore = Math.min(100, Math.round(
    (lines / 500) * 30 +
    (functions / 20) * 20 +
    (imports / 15) * 20 +
    (nestingDepth / 10) * 30
  ));

  return {
    path: filePath,
    lines,
    functions,
    exports,
    imports,
    complexityScore,
  };
}

// ---- Pattern Detection ----

/**
 * Detect code patterns from file contents and structure.
 */
export function detectPatterns(
  files: string[],
  rootPath: string,
  maxFileSize: number = MAX_FILE_SIZE_DEFAULT
): CodePattern[] {
  const patterns: CodePattern[] = [];
  const fileContents = new Map<string, string>();

  for (const file of files.slice(0, 200)) {
    try {
      const stat = statSync(file);
      if (stat.size <= maxFileSize) {
        fileContents.set(file, readFileSync(file, "utf-8"));
      }
    } catch {
      continue;
    }
  }

  // Detect large files (complexity hotspot)
  const largeFiles = files.filter((f) => {
    try {
      return statSync(f).size > 50 * 1024;
    } catch {
      return false;
    }
  });
  if (largeFiles.length > 0) {
    patterns.push({
      type: "complexity-hotspot",
      name: "Large source files",
      description: `${largeFiles.length} files exceed 50KB, suggesting they may benefit from decomposition`,
      locations: largeFiles.slice(0, 10).map((f) => relative(rootPath, f)),
      severity: largeFiles.length > 5 ? "high" : "medium",
      innovationPotential: 0.7,
    });
  }

  // Detect deeply nested directories (missing abstraction)
  const deepPaths = files.filter((f) => relative(rootPath, f).split("/").length > 5);
  if (deepPaths.length > 3) {
    patterns.push({
      type: "missing-abstraction",
      name: "Deep directory nesting",
      description: `${deepPaths.length} files are nested 5+ levels deep, potentially indicating over-complicated structure`,
      locations: deepPaths.slice(0, 5).map((f) => relative(rootPath, f)),
      severity: "medium",
      innovationPotential: 0.5,
    });
  }

  // Detect duplicated import patterns
  const importCounts = new Map<string, number>();
  for (const [, content] of fileContents) {
    const imports = content.match(/from\s+["']([^"']+)["']/g) ?? [];
    for (const imp of imports) {
      const pkg = imp.match(/from\s+["']([^"']+)["']/)?.[1] ?? "";
      if (pkg && !pkg.startsWith(".")) {
        importCounts.set(pkg, (importCounts.get(pkg) ?? 0) + 1);
      }
    }
  }
  const heavyDeps = Array.from(importCounts.entries())
    .filter(([, count]) => count > 10)
    .sort((a, b) => b[1] - a[1]);
  if (heavyDeps.length > 0) {
    patterns.push({
      type: "dependency-risk",
      name: "Heavy dependency coupling",
      description: `${heavyDeps.length} external packages are imported 10+ times across the codebase`,
      locations: heavyDeps.slice(0, 10).map(([pkg, count]) => `${pkg} (${count} imports)`),
      severity: heavyDeps.length > 3 ? "high" : "medium",
      innovationPotential: 0.6,
    });
  }

  // Detect TODO/FIXME/HACK comments (tech debt)
  const debtLocations: string[] = [];
  for (const [file, content] of fileContents) {
    const debtMatches = content.match(/\/\/\s*(?:TODO|FIXME|HACK|XXX)\b/gi);
    if (debtMatches && debtMatches.length > 0) {
      debtLocations.push(`${relative(rootPath, file)} (${debtMatches.length})`);
    }
  }
  if (debtLocations.length > 0) {
    patterns.push({
      type: "tech-debt",
      name: "Technical debt markers",
      description: `Found TODO/FIXME/HACK comments in ${debtLocations.length} files`,
      locations: debtLocations.slice(0, 10),
      severity: debtLocations.length > 10 ? "high" : "medium",
      innovationPotential: 0.8,
    });
  }

  // Detect console.log/print (potential logging concern)
  const logLocations: string[] = [];
  for (const [file, content] of fileContents) {
    const logMatches = content.match(/\bconsole\.(log|warn|error)\b/g);
    if (logMatches && logMatches.length > 5) {
      logLocations.push(`${relative(rootPath, file)} (${logMatches.length})`);
    }
  }
  if (logLocations.length > 3) {
    patterns.push({
      type: "anti-pattern",
      name: "Excessive console logging",
      description: `${logLocations.length} files have 5+ console.log calls — consider structured logging`,
      locations: logLocations.slice(0, 10),
      severity: "low",
      innovationPotential: 0.4,
    });
  }

  // Detect files without tests
  const srcFiles = files.filter((f) => !f.includes("test") && !f.includes("spec") && !f.includes("__tests__"));
  const testFiles = files.filter((f) => f.includes("test") || f.includes("spec") || f.includes("__tests__"));
  const testCoverage = srcFiles.length > 0 ? testFiles.length / srcFiles.length : 1;
  if (testCoverage < 0.3 && srcFiles.length > 5) {
    patterns.push({
      type: "anti-pattern",
      name: "Low test coverage ratio",
      description: `Test-to-source file ratio is ${(testCoverage * 100).toFixed(0)}% — consider improving test coverage`,
      locations: [`${srcFiles.length} source files, ${testFiles.length} test files`],
      severity: testCoverage < 0.1 ? "high" : "medium",
      innovationPotential: 0.6,
    });
  }

  // Detect any/unknown type usage (TypeScript)
  const anyLocations: string[] = [];
  for (const [file, content] of fileContents) {
    if (extname(file) === ".ts" || extname(file) === ".tsx") {
      const anyMatches = content.match(/:\s*any\b/g);
      if (anyMatches && anyMatches.length > 3) {
        anyLocations.push(`${relative(rootPath, file)} (${anyMatches.length})`);
      }
    }
  }
  if (anyLocations.length > 0) {
    patterns.push({
      type: "anti-pattern",
      name: "Excessive `any` type usage",
      description: `${anyLocations.length} TypeScript files use \`any\` type 3+ times`,
      locations: anyLocations.slice(0, 10),
      severity: "medium",
      innovationPotential: 0.5,
    });
  }

  return patterns;
}

// ---- Dependency Analysis ----

/**
 * Analyze dependencies from package.json or equivalent manifest.
 */
export function analyzeDependencies(rootPath: string): DependencyAnalysis[] {
  const deps: DependencyAnalysis[] = [];

  // Try package.json (Node.js)
  const packageJsonPath = join(rootPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };

      const categorize = (name: string): string => {
        if (name.includes("test") || name.includes("jest") || name.includes("vitest")) return "testing";
        if (name.includes("lint") || name.includes("prettier") || name.includes("eslint")) return "linting";
        if (name.includes("typescript") || name.includes("@types")) return "type-system";
        if (name.includes("react") || name.includes("vue") || name.includes("next")) return "framework";
        if (name.includes("express") || name.includes("fastify") || name.includes("koa")) return "server";
        if (name.includes("prisma") || name.includes("sql") || name.includes("mongoose")) return "database";
        return "utility";
      };

      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        deps.push({ name, version, type: "production", category: categorize(name) });
      }
      for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
        deps.push({ name, version, type: "development", category: categorize(name) });
      }
      for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
        deps.push({ name, version, type: "peer", category: categorize(name) });
      }
    } catch {
      // Skip malformed package.json
    }
  }

  // Try requirements.txt (Python)
  const requirementsPath = join(rootPath, "requirements.txt");
  if (existsSync(requirementsPath)) {
    try {
      const content = readFileSync(requirementsPath, "utf-8");
      for (const line of content.split("\n").filter(Boolean)) {
        const match = line.match(/^([a-zA-Z0-9_-]+)(?:([>=<~!]+)(.+))?/);
        if (match) {
          deps.push({
            name: match[1],
            version: match[3],
            type: "production",
            category: "utility",
          });
        }
      }
    } catch {
      // Skip
    }
  }

  return deps;
}

// ---- Architectural Layer Discovery ----

/**
 * Discover architectural layers from directory structure.
 */
export function discoverLayers(rootPath: string, files: string[]): ArchitecturalLayer[] {
  const layers: ArchitecturalLayer[] = [];
  const dirMap = new Map<string, string[]>();

  for (const file of files) {
    const rel = relative(rootPath, file);
    const parts = rel.split("/");
    if (parts.length >= 2) {
      const topDir = parts[0];
      const existing = dirMap.get(topDir) ?? [];
      existing.push(rel);
      dirMap.set(topDir, existing);
    }
  }

  const layerDescriptions: Record<string, string[]> = {
    src: ["Source code", "Business logic"],
    lib: ["Library code", "Shared utilities"],
    test: ["Test suites", "Quality assurance"],
    tests: ["Test suites", "Quality assurance"],
    __tests__: ["Unit tests", "Component tests"],
    api: ["API endpoints", "Request handling"],
    routes: ["Route definitions", "Request routing"],
    components: ["UI components", "Visual elements"],
    services: ["Service layer", "Business operations"],
    models: ["Data models", "Schema definitions"],
    utils: ["Utility functions", "Shared helpers"],
    config: ["Configuration", "Environment setup"],
    scripts: ["Build scripts", "Automation"],
    docs: ["Documentation", "Guides"],
    packages: ["Monorepo packages", "Sub-modules"],
    apps: ["Application entrypoints", "Deployable units"],
  };

  for (const [dir, dirFiles] of dirMap) {
    const responsibilities = layerDescriptions[dir.toLowerCase()] ?? [`${dir} module`];
    const depSet = new Set<string>();

    for (const file of dirFiles.slice(0, 50)) {
      const filePath = join(rootPath, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const imports = content.match(/from\s+["']\.\.\/([^/"']+)/g) ?? [];
        for (const imp of imports) {
          const dep = imp.match(/from\s+["']\.\.\/([^/"']+)/)?.[1];
          if (dep && dep !== dir) depSet.add(dep);
        }
      } catch {
        continue;
      }
    }

    layers.push({
      name: dir,
      path: dir,
      fileCount: dirFiles.length,
      responsibilities,
      dependencies: Array.from(depSet).slice(0, 20),
    });
  }

  return layers.sort((a, b) => b.fileCount - a.fileCount);
}

// ---- Subject Generation ----

/**
 * Generate innovation subjects from codebase analysis using LLM.
 */
export async function generateSubjects(
  analysis: {
    patterns: CodePattern[];
    dependencies: DependencyAnalysis[];
    layers: ArchitecturalLayer[];
    complexityHotspots: FileComplexity[];
    fileCount: number;
    totalLines: number;
    languages: string[];
  },
  model?: string,
  signal?: AbortSignal
): Promise<CodebaseSubject[]> {
  const patternSummary = analysis.patterns
    .map((p) => `- [${p.type}] ${p.name}: ${p.description} (severity: ${p.severity})`)
    .join("\n");

  const depSummary = analysis.dependencies
    .slice(0, 20)
    .map((d) => `- ${d.name} (${d.type}, ${d.category})`)
    .join("\n");

  const layerSummary = analysis.layers
    .slice(0, 10)
    .map((l) => `- ${l.name}: ${l.fileCount} files, deps: [${l.dependencies.join(", ")}]`)
    .join("\n");

  const hotspotSummary = analysis.complexityHotspots
    .slice(0, 10)
    .map((h) => `- ${h.path}: ${h.lines} lines, complexity ${h.complexityScore}`)
    .join("\n");

  // Lazy-import LLM dependencies to avoid loading copilot-sdk in sync-only usage
  const { generateText, extractJson } = await import("../copilot/client.js");
  const { withRetry } = await import("../copilot/retry.js");
  const { wrapUserInput } = await import("../prompts/sanitize.js");

  const codebaseSummary = `
Languages: ${analysis.languages.join(", ")}
Files: ${analysis.fileCount}, Lines: ${analysis.totalLines}

PATTERNS DETECTED:
${patternSummary || "None detected"}

KEY DEPENDENCIES:
${depSummary || "None found"}

ARCHITECTURAL LAYERS:
${layerSummary || "None found"}

COMPLEXITY HOTSPOTS:
${hotspotSummary || "None found"}
`;

  const prompt = `You are a software innovation strategist. Analyze the following codebase summary and generate innovation subjects — specific areas where creative thinking could significantly improve the codebase.

${wrapUserInput("CODEBASE SUMMARY", codebaseSummary)}

Generate 5-10 specific, actionable innovation subjects. Each should target a real improvement opportunity.

You MUST respond with valid JSON only:
{
  "subjects": [
    {
      "subject": "Specific innovation subject for investigation",
      "category": "architecture|developer-experience|performance|reliability|security|scalability|maintainability|testing|automation",
      "rationale": "Why this is an innovation opportunity",
      "relevantPatterns": ["pattern-name-1"],
      "priority": "low|medium|high|critical",
      "estimatedImpact": "Brief impact description"
    }
  ]
}`;

  try {
    const raw = await withRetry(
      async () => {
        const result = await generateText({ prompt, model, serverMode: true, signal });
        return extractJson(result);
      },
      { signal }
    );
    const parsed = JSON.parse(raw) as { subjects: CodebaseSubject[] };
    return parsed.subjects
      .slice(0, 10)
      .map((s) => CodebaseSubjectSchema.parse(s));
  } catch {
    return generateHeuristicSubjects(analysis);
  }
}

/**
 * Generate subjects using heuristics (no LLM required).
 */
function generateHeuristicSubjects(analysis: {
  patterns: CodePattern[];
  dependencies: DependencyAnalysis[];
  layers: ArchitecturalLayer[];
  complexityHotspots: FileComplexity[];
}): CodebaseSubject[] {
  const subjects: CodebaseSubject[] = [];

  for (const pattern of analysis.patterns) {
    if (pattern.innovationPotential >= 0.6) {
      subjects.push({
        subject: `Innovate on: ${pattern.name} — ${pattern.description}`,
        category: patternToCategory(pattern.type),
        rationale: `Detected ${pattern.type} pattern with ${pattern.severity} severity and ${(pattern.innovationPotential * 100).toFixed(0)}% innovation potential`,
        relevantPatterns: [pattern.name],
        priority: pattern.severity === "high" ? "high" : "medium",
        estimatedImpact: `Addressing this ${pattern.type} could improve code quality across ${pattern.locations.length} locations`,
      });
    }
  }

  // Dependency innovation opportunities
  const prodDeps = analysis.dependencies.filter((d) => d.type === "production");
  if (prodDeps.length > 20) {
    subjects.push({
      subject: "Reduce dependency footprint through consolidation or custom implementations",
      category: "maintainability",
      rationale: `${prodDeps.length} production dependencies detected — potential for supply chain risk reduction`,
      relevantPatterns: ["dependency-risk"],
      priority: "medium",
      estimatedImpact: "Reduced dependency surface area improves security and build times",
    });
  }

  // Complexity-driven subjects
  const highComplexity = analysis.complexityHotspots.filter((h) => h.complexityScore > 60);
  if (highComplexity.length > 0) {
    subjects.push({
      subject: "Decompose high-complexity modules into focused, testable components",
      category: "architecture",
      rationale: `${highComplexity.length} files exceed complexity threshold (score > 60)`,
      relevantPatterns: ["complexity-hotspot"],
      priority: "high",
      estimatedImpact: "Better testability, reduced cognitive load, faster onboarding",
    });
  }

  return subjects.slice(0, 10);
}

function patternToCategory(type: CodePattern["type"]): CodebaseSubject["category"] {
  const mapping: Record<string, CodebaseSubject["category"]> = {
    "design-pattern": "architecture",
    "anti-pattern": "maintainability",
    "complexity-hotspot": "architecture",
    "dependency-risk": "reliability",
    "missing-abstraction": "architecture",
    "tech-debt": "maintainability",
    "security-concern": "security",
    "performance-bottleneck": "performance",
  };
  return mapping[type] ?? "maintainability";
}

// ---- Main Analysis Function ----

/**
 * Analyze a codebase and generate innovation subjects.
 *
 * @param options - Analysis configuration
 * @returns Full codebase analysis report with subjects
 */
export async function analyzeCodebase(options: CodebaseAnalysisOptions): Promise<CodebaseAnalysis> {
  const {
    rootPath,
    exclude = DEFAULT_EXCLUDE,
    maxFiles = MAX_FILES_DEFAULT,
    maxFileSize = MAX_FILE_SIZE_DEFAULT,
    generateSubjects: genSubjects = true,
    model,
    signal,
  } = options;

  if (!existsSync(rootPath)) {
    throw new Error(`Root path does not exist: ${rootPath}`);
  }

  // Discover files
  const files = discoverFiles(rootPath, exclude, maxFiles);

  // Analyze file complexity
  const complexities: FileComplexity[] = [];
  for (const file of files) {
    const result = analyzeFile(file, maxFileSize);
    if (result) {
      complexities.push({ ...result, path: relative(rootPath, result.path) });
    }
  }

  // Detect languages
  const langCounts = new Map<string, number>();
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const lang = extToLanguage(ext);
    langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
  }
  const languages = Array.from(langCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);

  // Compute total lines
  const totalLines = complexities.reduce((sum, c) => sum + c.lines, 0);

  // Detect patterns
  const patterns = detectPatterns(files, rootPath, maxFileSize);

  // Analyze dependencies
  const dependencies = analyzeDependencies(rootPath);

  // Discover layers
  const layers = discoverLayers(rootPath, files);

  // Sort hotspots by complexity
  const complexityHotspots = complexities
    .sort((a, b) => b.complexityScore - a.complexityScore)
    .slice(0, 50);

  // Generate subjects
  let subjects: CodebaseSubject[] = [];
  if (genSubjects) {
    subjects = await generateSubjects(
      { patterns, dependencies, layers, complexityHotspots, fileCount: files.length, totalLines, languages },
      model,
      signal
    );
  }

  return {
    rootPath,
    analyzedAt: new Date().toISOString(),
    fileCount: files.length,
    totalLines,
    languages,
    patterns,
    dependencies,
    layers,
    complexityHotspots,
    subjects,
  };
}

/**
 * Quick analysis without LLM — returns heuristic subjects only.
 */
export function analyzeCodebaseSync(rootPath: string, options?: Partial<CodebaseAnalysisOptions>): Omit<CodebaseAnalysis, "subjects"> & { subjects: CodebaseSubject[] } {
  if (!existsSync(rootPath)) {
    throw new Error(`Root path does not exist: ${rootPath}`);
  }

  const exclude = options?.exclude ?? DEFAULT_EXCLUDE;
  const maxFiles = options?.maxFiles ?? MAX_FILES_DEFAULT;
  const maxFileSize = options?.maxFileSize ?? MAX_FILE_SIZE_DEFAULT;

  const files = discoverFiles(rootPath, exclude, maxFiles);
  const complexities: FileComplexity[] = [];
  for (const file of files) {
    const result = analyzeFile(file, maxFileSize);
    if (result) {
      complexities.push({ ...result, path: relative(rootPath, result.path) });
    }
  }

  const langCounts = new Map<string, number>();
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    langCounts.set(extToLanguage(ext), (langCounts.get(extToLanguage(ext)) ?? 0) + 1);
  }

  const totalLines = complexities.reduce((sum, c) => sum + c.lines, 0);
  const patterns = detectPatterns(files, rootPath, maxFileSize);
  const dependencies = analyzeDependencies(rootPath);
  const layers = discoverLayers(rootPath, files);
  const complexityHotspots = complexities.sort((a, b) => b.complexityScore - a.complexityScore).slice(0, 50);
  const subjects = generateHeuristicSubjects({ patterns, dependencies, layers, complexityHotspots });

  return {
    rootPath,
    analyzedAt: new Date().toISOString(),
    fileCount: files.length,
    totalLines,
    languages: Array.from(langCounts.entries()).sort((a, b) => b[1] - a[1]).map(([l]) => l),
    patterns,
    dependencies,
    layers,
    complexityHotspots,
    subjects,
  };
}

/**
 * Export codebase analysis as Markdown report.
 */
export function analysisToMarkdown(analysis: CodebaseAnalysis): string {
  const lines: string[] = [
    "# Codebase Innovation Analysis",
    "",
    `**Analyzed:** ${analysis.analyzedAt}`,
    `**Files:** ${analysis.fileCount} | **Lines:** ${analysis.totalLines.toLocaleString()}`,
    `**Languages:** ${analysis.languages.join(", ")}`,
    "",
  ];

  if (analysis.subjects.length > 0) {
    lines.push("## Innovation Subjects", "");
    for (const s of analysis.subjects) {
      lines.push(`### ${s.priority === "critical" ? "🔴" : s.priority === "high" ? "🟡" : "🟢"} ${s.subject}`);
      lines.push(`**Category:** ${s.category} | **Priority:** ${s.priority}`);
      lines.push(`**Rationale:** ${s.rationale}`);
      lines.push(`**Impact:** ${s.estimatedImpact}`);
      lines.push("");
    }
  }

  if (analysis.patterns.length > 0) {
    lines.push("## Detected Patterns", "");
    for (const p of analysis.patterns) {
      lines.push(`- **[${p.severity}]** ${p.name}: ${p.description}`);
    }
    lines.push("");
  }

  if (analysis.complexityHotspots.length > 0) {
    lines.push("## Complexity Hotspots", "");
    lines.push("| File | Lines | Functions | Complexity |");
    lines.push("|------|-------|-----------|------------|");
    for (const h of analysis.complexityHotspots.slice(0, 10)) {
      lines.push(`| \`${h.path}\` | ${h.lines} | ${h.functions} | ${h.complexityScore} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---- Helpers ----

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".swift": "Swift",
    ".kt": "Kotlin",
  };
  return map[ext] ?? "Unknown";
}
