/**
 * @module innovation
 *
 * Core innovation engine — angle definitions, subject investigation,
 * per-angle idea generation, and the full auto-mode pipeline.
 */
export { ANGLES, getAngleById } from "./angles.js";
export { investigate } from "./investigate.js";
export { generateForAngle } from "./generate.js";
export { runAutoPipeline } from "./pipeline.js";
export {
  loadCustomAngles,
  addCustomAngle,
  removeCustomAngle,
  getCustomAngle,
  updateCustomAngle,
  exportAnglePack,
  importAnglePack,
  buildCustomAnglePrompt,
} from "./custom-angles.js";
export { runComparativePipeline, buildComparativeSynthesisPrompt } from "./comparative.js";
export type { ComparativeProgress, ComparativeSynthesis } from "./comparative.js";
