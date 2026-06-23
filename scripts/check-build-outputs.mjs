#!/usr/bin/env node

import { existsSync } from "node:fs";

const expectedOutputs = [
  "packages/core/dist/index.js",
  "packages/core/dist/client.js",
  "apps/cli/dist/index.js",
  "apps/cli/dist/program.js",
  "apps/web/.next/BUILD_ID",
  "packages/bot/dist/index.js",
  "packages/mcp-server/dist/index.js",
  "packages/mcp-server/dist/server.js",
  "packages/sdk/dist/index.js",
  "packages/vscode-extension/dist/extension.js",
  "packages/create-innovator/dist/index.js",
];

const missingOutputs = expectedOutputs.filter((filePath) => !existsSync(filePath));

if (missingOutputs.length > 0) {
  console.error(`Missing build outputs:\n- ${missingOutputs.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${expectedOutputs.length} production build outputs.`);
}
