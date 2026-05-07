/**
 * @module custom-angles
 *
 * File-based persistence for user-defined custom innovation angles.
 * Stores angles as JSON in ~/.innovator/custom-angles.json.
 * Supports import/export via .angle.json pack files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CustomAngleSchema, AnglePackSchema, type CustomAngle, type AnglePack } from "../types.js";

const CONFIG_DIR = join(homedir(), ".innovator");
const ANGLES_FILE = join(CONFIG_DIR, "custom-angles.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load all custom angles from disk.
 * Reads and validates entries from ~/.innovator/custom-angles.json.
 * @returns {CustomAngle[]} Array of custom angles, or empty array if file doesn't exist or is invalid.
 */
export function loadCustomAngles(): CustomAngle[] {
  try {
    if (!existsSync(ANGLES_FILE)) return [];
    const raw = readFileSync(ANGLES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a: unknown) => CustomAngleSchema.safeParse(a).success);
  } catch {
    return [];
  }
}

/** Save all custom angles to disk. */
function saveCustomAngles(angles: CustomAngle[]): void {
  ensureConfigDir();
  writeFileSync(ANGLES_FILE, JSON.stringify(angles, null, 2), "utf-8");
}

/**
 * Add a new custom angle. Validates the angle against the schema before saving.
 * @param {CustomAngle} angle - The custom angle to add.
 * @throws {Error} If an angle with the same ID already exists or validation fails.
 */
export function addCustomAngle(angle: CustomAngle): void {
  const validated = CustomAngleSchema.parse(angle);
  const existing = loadCustomAngles();
  if (existing.some((a) => a.id === validated.id)) {
    throw new Error(`Custom angle with ID "${validated.id}" already exists`);
  }
  existing.push(validated);
  saveCustomAngles(existing);
}

/**
 * Remove a custom angle by ID.
 * @param {string} id - The unique identifier of the angle to remove.
 * @returns {boolean} True if the angle was found and removed, false otherwise.
 */
export function removeCustomAngle(id: string): boolean {
  const existing = loadCustomAngles();
  const filtered = existing.filter((a) => a.id !== id);
  if (filtered.length === existing.length) return false;
  saveCustomAngles(filtered);
  return true;
}

/**
 * Get a custom angle by ID.
 * @param {string} id - The unique identifier of the angle to retrieve.
 * @returns {CustomAngle | undefined} The matching custom angle, or undefined if not found.
 */
export function getCustomAngle(id: string): CustomAngle | undefined {
  return loadCustomAngles().find((a) => a.id === id);
}

/**
 * Update an existing custom angle. Validates the angle against the schema before saving.
 * @param {CustomAngle} angle - The custom angle with updated fields. Must have an existing ID.
 * @throws {Error} If no angle with the given ID exists or validation fails.
 */
export function updateCustomAngle(angle: CustomAngle): void {
  const validated = CustomAngleSchema.parse(angle);
  const existing = loadCustomAngles();
  const index = existing.findIndex((a) => a.id === validated.id);
  if (index === -1) {
    throw new Error(`Custom angle "${validated.id}" not found`);
  }
  existing[index] = validated;
  saveCustomAngles(existing);
}

/** Export custom angles as an angle pack. */
export function exportAnglePack(
  name: string,
  angleIds?: string[],
  description?: string
): AnglePack {
  const all = loadCustomAngles();
  const angles = angleIds ? all.filter((a) => angleIds.includes(a.id)) : all;
  if (angles.length === 0) {
    throw new Error("No angles to export");
  }
  return { name, description, version: "1.0.0", angles };
}

/** Import angles from an angle pack. Skips angles with duplicate IDs. Returns imported count. */
export function importAnglePack(pack: unknown): { imported: number; skipped: string[] } {
  const validated = AnglePackSchema.parse(pack);
  const existing = loadCustomAngles();
  const existingIds = new Set(existing.map((a) => a.id));
  const skipped: string[] = [];

  for (const angle of validated.angles) {
    if (existingIds.has(angle.id)) {
      skipped.push(angle.id);
    } else {
      existing.push(angle);
      existingIds.add(angle.id);
    }
  }

  saveCustomAngles(existing);
  return { imported: validated.angles.length - skipped.length, skipped };
}

/** Build a prompt from a custom angle's template by replacing placeholders. */
export function buildCustomAnglePrompt(
  angle: CustomAngle,
  subject: string,
  investigationContext: string
): string {
  return angle.promptTemplate
    .replace(/\{\{subject\}\}/g, subject)
    .replace(/\{\{investigation\}\}/g, investigationContext);
}
