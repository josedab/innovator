/**
 * @module session-handoff
 *
 * Portable session bundles for cross-instance sharing.
 * Export as JSON + HTML, share via URL/QR code, import on any instance.
 */

export {
  createBundle,
  importSessionBundle,
  getBundle,
  listBundles,
  deleteBundle,
  shareBundle,
  getShareInfo,
} from "./bundle.js";
export { SESSION_BUNDLE_VERSION, CreateBundleSchema, ImportBundleSchema } from "./types.js";
export type { SessionBundle, SessionMetadata, SessionShareInfo } from "./types.js";
