#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const MIN_API_KEY_LENGTH = 32;

export function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== "production") return [];

  const errors = [];
  if (env.INNOVATOR_DEPLOYMENT_PROFILE !== "single-tenant") {
    errors.push('INNOVATOR_DEPLOYMENT_PROFILE must be "single-tenant"');
  }
  if (env.INNOVATOR_API_KEY?.trim()) {
    errors.push("INNOVATOR_API_KEY is legacy; production must use INNOVATOR_API_KEYS");
  }

  const keys = (env.INNOVATOR_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    errors.push("INNOVATOR_API_KEYS must contain at least one key");
  } else {
    if (keys.some((key) => key.length < MIN_API_KEY_LENGTH)) {
      errors.push(`Production API keys must be at least ${MIN_API_KEY_LENGTH} characters`);
    }
    if (new Set(keys).size !== keys.length) {
      errors.push("INNOVATOR_API_KEYS must not contain duplicate keys");
    }
  }
  if (!env.GH_TOKEN?.trim()) {
    errors.push("GH_TOKEN is required for the production Copilot provider");
  }

  return errors;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const errors = validateProductionEnvironment();
  if (errors.length > 0) {
    console.error(`Production environment validation failed:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
  }
}
