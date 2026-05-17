/**
 * @module action-generation
 *
 * Structured Output & Action Generation — barrel exports.
 */

export {
  PRDSchema,
  UserStorySchema,
  UserStorySetSchema,
  KeyResultSchema,
  OKRSetSchema,
  PitchSlideSchema,
  PitchDeckSchema,
  ADRSchema,
  GitHubIssueSchema,
  JiraTicketSchema,
  ActionFormatSchema,
  ActionContextSchema,
} from "./types.js";

export type {
  PRD,
  UserStory,
  UserStorySet,
  KeyResult,
  OKRSet,
  PitchSlide,
  PitchDeck,
  ADR,
  GitHubIssue,
  JiraTicket,
  ActionFormat,
  ActionContext,
} from "./types.js";

export {
  prdToMarkdown,
  userStoriesToMarkdown,
  okrsToMarkdown,
  pitchDeckToMarkdown,
  adrToMarkdown,
  contextToGitHubIssue,
  contextToJiraTicket,
  createGitHubIssue,
  generateAllFormats,
  getPromptForFormat,
  getSchemaForFormat,
  actionToMarkdown,
  listActionFormats,
} from "./action-generation.js";

export type { CreateGitHubIssueOptions, CreateGitHubIssueResult } from "./action-generation.js";
