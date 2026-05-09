/**
 * In-memory template storage. In production, use a database.
 */
import type { SessionTemplate, WizardAnswers, GeneratedConfig } from "./types.js";

const templates = new Map<string, SessionTemplate>();

/** Save a session template. */
export function saveTemplate(
  name: string,
  description: string,
  answers: WizardAnswers,
  config: GeneratedConfig
): SessionTemplate {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const template: SessionTemplate = {
    id,
    name,
    description,
    answers,
    config,
    createdAt: now,
    updatedAt: now,
  };
  templates.set(id, template);
  return template;
}

/** Get a template by ID. */
export function getSessionTemplate(id: string): SessionTemplate | null {
  return templates.get(id) ?? null;
}

/** List all saved templates. */
export function listTemplates(): SessionTemplate[] {
  return Array.from(templates.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Delete a template. */
export function deleteTemplate(id: string): boolean {
  return templates.delete(id);
}

/** Update a template. */
export function updateSessionTemplate(
  id: string,
  updates: Partial<Pick<SessionTemplate, "name" | "description">>
): SessionTemplate | null {
  const template = templates.get(id);
  if (!template) return null;
  if (updates.name) template.name = updates.name;
  if (updates.description !== undefined) template.description = updates.description;
  template.updatedAt = new Date().toISOString();
  return template;
}
