#!/usr/bin/env node

import chalk from "chalk";
import { runCli } from "./program.js";

runCli().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
});
