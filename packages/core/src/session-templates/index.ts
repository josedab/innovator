/**
 * @module session-templates
 *
 * Guided wizard for configuring innovation pipelines.
 * Maps user goals to optimal pipeline configuration via decision tree.
 */

export { WIZARD_QUESTIONS, generateConfig } from "./engine.js";
export {
  saveTemplate,
  getSessionTemplate,
  listTemplates,
  deleteTemplate,
  updateSessionTemplate,
} from "./storage.js";
export { WizardAnswersSchema, SaveTemplateSchema } from "./types.js";
export type { WizardQuestion, WizardAnswers, GeneratedConfig, SessionTemplate } from "./types.js";
