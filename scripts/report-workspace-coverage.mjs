#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = resolve(ROOT, process.argv[2] ?? "coverage/coverage-summary.json");
const metrics = ["lines", "functions", "branches"];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getWorkspacePatterns(packageJson) {
  return Array.isArray(packageJson.workspaces)
    ? packageJson.workspaces
    : (packageJson.workspaces?.packages ?? []);
}

function findWorkspaces() {
  const rootPackage = readJson(resolve(ROOT, "package.json"));
  const workspaces = [];

  for (const pattern of getWorkspacePatterns(rootPackage)) {
    if (pattern.endsWith("/*")) {
      const basePath = resolve(ROOT, pattern.slice(0, -2));
      if (!existsSync(basePath)) continue;

      for (const entry of readdirSync(basePath, { withFileTypes: true })) {
        const workspacePath = resolve(basePath, entry.name);
        const packagePath = resolve(workspacePath, "package.json");
        if (!entry.isDirectory() || !existsSync(packagePath)) continue;
        const packageJson = readJson(packagePath);
        workspaces.push({
          name: packageJson.name ?? relative(ROOT, workspacePath),
          path: workspacePath,
          relativePath: relative(ROOT, workspacePath),
        });
      }
      continue;
    }

    const workspacePath = resolve(ROOT, pattern);
    const packagePath = resolve(workspacePath, "package.json");
    if (!existsSync(packagePath)) continue;
    const packageJson = readJson(packagePath);
    workspaces.push({
      name: packageJson.name ?? pattern,
      path: workspacePath,
      relativePath: relative(ROOT, workspacePath),
    });
  }

  return workspaces.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function containsFile(workspacePath, filePath) {
  const pathFromWorkspace = relative(workspacePath, filePath);
  return pathFromWorkspace !== ".." && !pathFromWorkspace.startsWith(`..${sep}`);
}

function emptyTotals() {
  return Object.fromEntries(metrics.map((metric) => [metric, { covered: 0, total: 0 }]));
}

function formatMetric({ covered, total }) {
  if (total === 0) return "n/a";
  return `${((covered / total) * 100).toFixed(2)}% (${covered}/${total})`;
}

if (!existsSync(summaryPath)) {
  console.error(`Coverage summary not found: ${relative(ROOT, summaryPath)}`);
  process.exitCode = 1;
} else {
  const summary = readJson(summaryPath);
  const workspaces = findWorkspaces().map((workspace) => ({
    ...workspace,
    fileCount: 0,
    totals: emptyTotals(),
  }));

  for (const [coveredPath, fileSummary] of Object.entries(summary)) {
    if (coveredPath === "total") continue;

    const filePath = resolve(ROOT, coveredPath);
    const workspace = workspaces.find((candidate) => containsFile(candidate.path, filePath));
    if (!workspace) continue;

    workspace.fileCount++;
    for (const metric of metrics) {
      workspace.totals[metric].covered += fileSummary[metric]?.covered ?? 0;
      workspace.totals[metric].total += fileSummary[metric]?.total ?? 0;
    }
  }

  console.log("\nWorkspace coverage (informational; no package thresholds):");
  for (const workspace of workspaces) {
    const coverage = metrics
      .map((metric) => `${metric} ${formatMetric(workspace.totals[metric])}`)
      .join(" | ");
    console.log(`- ${workspace.name} (${workspace.relativePath}): ${coverage}`);
  }
}
