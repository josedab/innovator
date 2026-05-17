/**
 * @module action-generation/types
 *
 * Zod schemas and TypeScript types for structured output formats:
 * PRDs, user stories, OKRs, pitch decks, ADRs, GitHub issues, and Jira tickets.
 */

import { z } from "zod";

// ---- PRD ----

/** Schema for a Product Requirements Document generated from innovation results. */
export const PRDSchema = z.object({
  title: z.string().max(500),
  summary: z.string().max(2000),
  problemStatement: z.string().max(3000),
  proposedSolution: z.string().max(5000),
  goals: z.array(z.string().max(500)).max(10),
  nonGoals: z.array(z.string().max(500)).max(10),
  userPersonas: z
    .array(
      z.object({
        name: z.string().max(200),
        description: z.string().max(1000),
        needs: z.array(z.string().max(500)).max(10),
      })
    )
    .max(10),
  requirements: z
    .array(
      z.object({
        id: z.string().max(50),
        priority: z.enum(["must-have", "should-have", "nice-to-have"]),
        description: z.string().max(1000),
        acceptanceCriteria: z.array(z.string().max(500)).max(10),
      })
    )
    .max(30),
  successMetrics: z
    .array(
      z.object({
        metric: z.string().max(200),
        target: z.string().max(200),
        measurement: z.string().max(500),
      })
    )
    .max(10),
  timeline: z.string().max(2000).optional(),
  risks: z
    .array(
      z.object({
        risk: z.string().max(500),
        mitigation: z.string().max(500),
        severity: z.enum(["low", "medium", "high"]),
      })
    )
    .max(10),
});

export type PRD = z.infer<typeof PRDSchema>;

// ---- User Story ----

/** Schema for a user story derived from innovation ideas. */
export const UserStorySchema = z.object({
  id: z.string().max(50),
  title: z.string().max(500),
  asA: z.string().max(200),
  iWant: z.string().max(500),
  soThat: z.string().max(500),
  acceptanceCriteria: z.array(z.string().max(500)).max(10),
  priority: z.enum(["critical", "high", "medium", "low"]),
  storyPoints: z.number().min(1).max(21).optional(),
  tags: z.array(z.string().max(100)).max(10).optional(),
});

export type UserStory = z.infer<typeof UserStorySchema>;

/** Schema for a batch of user stories. */
export const UserStorySetSchema = z.object({
  epicTitle: z.string().max(500),
  epicDescription: z.string().max(2000),
  stories: z.array(UserStorySchema).max(50),
});

export type UserStorySet = z.infer<typeof UserStorySetSchema>;

// ---- OKRs ----

/** Schema for a key result within an OKR. */
export const KeyResultSchema = z.object({
  id: z.string().max(50),
  description: z.string().max(500),
  metric: z.string().max(200),
  currentValue: z.string().max(100),
  targetValue: z.string().max(100),
  confidence: z.number().min(0).max(1),
});

export type KeyResult = z.infer<typeof KeyResultSchema>;

/** Schema for an Objectives and Key Results set. */
export const OKRSetSchema = z.object({
  timeframe: z.string().max(100),
  objectives: z
    .array(
      z.object({
        id: z.string().max(50),
        title: z.string().max(500),
        description: z.string().max(1000),
        keyResults: z.array(KeyResultSchema).max(5),
      })
    )
    .max(5),
});

export type OKRSet = z.infer<typeof OKRSetSchema>;

// ---- Pitch Deck ----

/** Schema for a pitch deck slide. */
export const PitchSlideSchema = z.object({
  slideNumber: z.number().min(1),
  title: z.string().max(200),
  content: z.string().max(3000),
  speakerNotes: z.string().max(2000).optional(),
  layout: z.enum(["title", "content", "two-column", "chart", "quote", "closing"]),
});

export type PitchSlide = z.infer<typeof PitchSlideSchema>;

/** Schema for a complete pitch deck. */
export const PitchDeckSchema = z.object({
  title: z.string().max(500),
  subtitle: z.string().max(500).optional(),
  audienceType: z.enum(["investors", "executives", "technical", "general"]),
  slides: z.array(PitchSlideSchema).max(20),
  estimatedDurationMinutes: z.number().min(1).max(60),
});

export type PitchDeck = z.infer<typeof PitchDeckSchema>;

// ---- ADR ----

/** Schema for an Architecture Decision Record. */
export const ADRSchema = z.object({
  id: z.string().max(50),
  title: z.string().max(500),
  status: z.enum(["proposed", "accepted", "deprecated", "superseded"]),
  context: z.string().max(3000),
  decision: z.string().max(3000),
  consequences: z
    .array(
      z.object({
        type: z.enum(["positive", "negative", "neutral"]),
        description: z.string().max(500),
      })
    )
    .max(10),
  alternatives: z
    .array(
      z.object({
        title: z.string().max(200),
        description: z.string().max(1000),
        reason: z.string().max(500),
      })
    )
    .max(5),
  date: z.string().max(50),
});

export type ADR = z.infer<typeof ADRSchema>;

// ---- GitHub Issue ----

/** Schema for a GitHub issue to be created from an idea. */
export const GitHubIssueSchema = z.object({
  title: z.string().max(256),
  body: z.string().max(65536),
  labels: z.array(z.string().max(50)).max(10).optional(),
  milestone: z.string().max(200).optional(),
  assignees: z.array(z.string().max(100)).max(10).optional(),
});

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

// ---- Jira Ticket ----

/** Schema for a Jira ticket to be created from an idea. */
export const JiraTicketSchema = z.object({
  summary: z.string().max(255),
  description: z.string().max(32767),
  issueType: z.enum(["Story", "Task", "Bug", "Epic"]),
  priority: z.enum(["Highest", "High", "Medium", "Low", "Lowest"]),
  labels: z.array(z.string().max(100)).max(10).optional(),
  components: z.array(z.string().max(100)).max(5).optional(),
  storyPoints: z.number().min(0).max(100).optional(),
});

export type JiraTicket = z.infer<typeof JiraTicketSchema>;

// ---- Output Format Enum ----

/** All supported action output formats. */
export const ActionFormatSchema = z.enum([
  "prd",
  "user-stories",
  "okrs",
  "pitch-deck",
  "adr",
  "github-issue",
  "jira-ticket",
]);

export type ActionFormat = z.infer<typeof ActionFormatSchema>;

// ---- Generation Input ----

/** Input context for action generation. */
export const ActionContextSchema = z.object({
  subject: z.string().max(2000),
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  potentialImpact: z.string().max(2000).optional(),
  implementationHint: z.string().max(2000).optional(),
  sourceAngle: z.string().max(200).optional(),
  additionalContext: z.string().max(5000).optional(),
});

export type ActionContext = z.infer<typeof ActionContextSchema>;
