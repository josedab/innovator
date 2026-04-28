#!/usr/bin/env node

/**
 * Prerequisite health-check for Innovator development.
 * Verifies Node version, GitHub CLI, auth, and core build output.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
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

// 2. GitHub CLI installed
check("GitHub CLI (gh) installed", () => {
  try {
    const version = execSync("gh --version", { encoding: "utf8" }).trim().split("\n")[0];
    return { ok: true, version };
  } catch {
    throw new Error("gh CLI not found — install from https://cli.github.com");
  }
});

// 3. GitHub CLI authenticated
check("GitHub CLI authenticated", () => {
  try {
    execSync("gh auth status", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    throw new Error("Not authenticated — run: gh auth login");
  }
});

// 4. packages/core/dist/ exists
check("Core package built (packages/core/dist/)", () => {
  const distPath = resolve(ROOT, "packages/core/dist");
  if (!existsSync(distPath)) {
    throw new Error("Not found — run: npm run build --workspace=packages/core");
  }
});

console.log("");
process.exit(exitCode);
