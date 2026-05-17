#!/usr/bin/env node

/**
 * Prerequisite health-check for Innovator development.
 * Verifies Node version, GitHub CLI, auth, core build output,
 * workspace integrity, TypeScript version, and git hooks.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PASS = "✅";
const FAIL = "❌";
const WARN = "⚠️";

let exitCode = 0;

function check(label, fn) {
  try {
    const result = fn();
    if (result && result.warn) {
      console.log(`${WARN}  ${label}: ${result.warn}`);
    } else {
      console.log(`${PASS}  ${label}`);
    }
  } catch (err) {
    console.log(`${FAIL}  ${label}: ${err.message}`);
    exitCode = 1;
  }
}

console.log("\n🩺 Innovator Doctor\n");

// 1. Node.js version >= 20
check("Node.js >= 20", () => {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 20) {
    throw new Error(`Found Node.js ${process.versions.node} — upgrade to 20+`);
  }
});

// 2. npm version >= 10
check("npm >= 10", () => {
  try {
    const version = execSync("npm --version", { encoding: "utf8" }).trim();
    const major = parseInt(version.split(".")[0], 10);
    if (major < 10) {
      throw new Error(`Found npm ${version} — upgrade to 10+ (comes with Node 20+)`);
    }
  } catch (err) {
    if (err.message.includes("Found npm")) throw err;
    throw new Error("npm not found");
  }
});

// 3. TypeScript version check
check("TypeScript >= 5.6", () => {
  try {
    const version = execSync("npx tsc --version", { encoding: "utf8" }).trim();
    const match = version.match(/(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major < 5 || (major === 5 && minor < 6)) {
        throw new Error(`Found TypeScript ${version} — need 5.6+`);
      }
    }
  } catch (err) {
    if (err.message.includes("Found TypeScript")) throw err;
    throw new Error("TypeScript not found — run: npm install");
  }
});

// 4. GitHub CLI installed
check("GitHub CLI (gh) installed", () => {
  try {
    const version = execSync("gh --version", { encoding: "utf8" }).trim().split("\n")[0];
    return { ok: true, version };
  } catch {
    throw new Error("gh CLI not found — install from https://cli.github.com");
  }
});

// 5. GitHub CLI authenticated
check("GitHub CLI authenticated", () => {
  try {
    execSync("gh auth status", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    throw new Error("Not authenticated — run: gh auth login");
  }
});

// 6. packages/core/dist/ exists
check("Core package built (packages/core/dist/)", () => {
  const distPath = resolve(ROOT, "packages/core/dist");
  if (!existsSync(distPath)) {
    throw new Error("Not found — run: npm run build --workspace=packages/core");
  }
});

// 7. .env.local exists
check(".env.local configuration file", () => {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    return { warn: "Not found — copy from .env.local.example: cp .env.local.example .env.local" };
  }
});

// 8. node_modules exists (dependencies installed)
check("Dependencies installed (node_modules/)", () => {
  const nmPath = resolve(ROOT, "node_modules");
  if (!existsSync(nmPath)) {
    throw new Error("Not found — run: npm install");
  }
});

// 9. Workspace integrity — all workspace package.json files exist
check("Workspace packages valid", () => {
  const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  const workspacePatterns = rootPkg.workspaces || [];
  let missing = [];

  for (const pattern of workspacePatterns) {
    // Only check literal paths (not glob patterns for existence)
    if (!pattern.includes("*")) {
      const pkgPath = resolve(ROOT, pattern, "package.json");
      if (!existsSync(pkgPath)) {
        missing.push(pattern);
      }
    }
  }

  if (missing.length > 0) {
    return { warn: `Missing workspace package.json in: ${missing.join(", ")}` };
  }
});

// 10. Git hooks installed
check("Git hooks configured (.husky/)", () => {
  const huskyPath = resolve(ROOT, ".husky");
  if (!existsSync(huskyPath)) {
    return { warn: "Husky not initialized — run: npm run prepare" };
  }
});

// 11. .nvmrc matches running Node major version
check("Node version matches .nvmrc", () => {
  const nvmrcPath = resolve(ROOT, ".nvmrc");
  if (!existsSync(nvmrcPath)) {
    return { warn: ".nvmrc not found" };
  }
  const nvmrc = readFileSync(nvmrcPath, "utf8").trim();
  const expectedMajor = parseInt(nvmrc.replace("v", ""), 10);
  const actualMajor = parseInt(process.versions.node.split(".")[0], 10);
  if (expectedMajor && actualMajor !== expectedMajor) {
    return { warn: `.nvmrc specifies Node ${nvmrc} but running ${process.versions.node}` };
  }
});

console.log("");
process.exit(exitCode);
