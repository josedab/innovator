/**
 * @module realtime/session-summary
 *
 * Post-session summary helpers for collaborative innovation sessions.
 */

import { z } from "zod";
import type { CollaborativeIdea, CollaborativeSession } from "../types.js";

export const SessionSummarySchema = z.object({
  sessionId: z.string().max(200),
  title: z.string().max(500),
  subject: z.string().max(2000),
  participantCount: z.number().int().min(1),
  totalIdeas: z.number().int().min(0),
  totalVotes: z.number().int().min(0),
  durationMinutes: z.number().min(0),
  topIdeas: z
    .array(
      z.object({
        title: z.string().max(500),
        votes: z.number().int().min(0),
        angleId: z.string().max(100),
      })
    )
    .max(10),
  angleDistribution: z.array(
    z.object({
      angleId: z.string().max(100),
      ideaCount: z.number().int().min(0),
    })
  ),
  highlights: z.array(z.string().max(500)).max(10),
  generatedAt: z.string(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function getLatestTimestamp(session: CollaborativeSession): number {
  const timestamps: number[] = [Date.parse(session.createdAt)];

  for (const participant of session.participants) {
    timestamps.push(Date.parse(participant.joinedAt));
  }

  for (const idea of session.ideas) {
    timestamps.push(Date.parse(idea.createdAt));
    for (const comment of idea.comments) {
      timestamps.push(Date.parse(comment.createdAt));
    }
  }

  return timestamps.filter((value) => Number.isFinite(value)).reduce((max, value) => Math.max(max, value), 0);
}

function buildHighlights(
  session: CollaborativeSession,
  topIdeas: Array<{ title: string; votes: number; angleId: string }>,
  angleDistribution: Array<{ angleId: string; ideaCount: number }>,
  durationMinutes: number,
  totalVotes: number
): string[] {
  const highlights: string[] = [];
  highlights.push(
    truncate(
      `${session.participants.length} participants collaborated on ${session.ideas.length} ideas in ${durationMinutes} minutes.`,
      500
    )
  );

  if (topIdeas[0]) {
    highlights.push(truncate(`Top idea: ${topIdeas[0].title} (${topIdeas[0].votes} votes).`, 500));
  }

  if (angleDistribution[0]) {
    highlights.push(
      truncate(
        `Most active angle: ${angleDistribution[0].angleId} with ${angleDistribution[0].ideaCount} ideas.`,
        500
      )
    );
  }

  if (totalVotes > 0) {
    highlights.push(truncate(`Participants cast ${totalVotes} total votes across the session.`, 500));
  }

  const commentedIdeas = session.ideas.filter((idea) => idea.comments.length > 0).length;
  if (commentedIdeas > 0) {
    highlights.push(
      truncate(`${commentedIdeas} ideas received follow-up discussion through comments.`, 500)
    );
  }

  if (session.status === "completed") {
    highlights.push(
      truncate("Session reached completion and is ready for follow-up prioritization.", 500)
    );
  }

  return highlights.slice(0, 10);
}

function sortIdeas(ideas: CollaborativeIdea[]): CollaborativeIdea[] {
  return [...ideas].sort(
    (a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

/** Generate a structured summary for a collaborative session. */
export function generateSessionSummary(session: CollaborativeSession): SessionSummary {
  const participantCount = session.participants.length;
  const totalIdeas = session.ideas.length;
  const totalVotes = Object.values(session.votes).reduce((sum, voters) => sum + voters.length, 0);
  const createdAt = Date.parse(session.createdAt);
  const latestTimestamp = getLatestTimestamp(session);
  const durationMinutes =
    Number.isFinite(createdAt) && latestTimestamp >= createdAt
      ? Math.round(((latestTimestamp - createdAt) / 60000) * 10) / 10
      : 0;

  const topIdeas = sortIdeas(session.ideas)
    .slice(0, 10)
    .map((idea) => ({
      title: truncate(idea.title, 500),
      votes: idea.votes,
      angleId: truncate(idea.angleId, 100),
    }));

  const angleCounts = new Map<string, number>();
  for (const idea of session.ideas) {
    angleCounts.set(idea.angleId, (angleCounts.get(idea.angleId) ?? 0) + 1);
  }

  const angleDistribution = Array.from(angleCounts.entries())
    .map(([angleId, ideaCount]) => ({ angleId: truncate(angleId, 100), ideaCount }))
    .sort((a, b) => b.ideaCount - a.ideaCount || a.angleId.localeCompare(b.angleId));

  const summary = {
    sessionId: session.id,
    title: truncate(`Collaborative Innovation Session — ${session.subject}`, 500),
    subject: truncate(session.subject, 2000),
    participantCount,
    totalIdeas,
    totalVotes,
    durationMinutes,
    topIdeas,
    angleDistribution,
    highlights: buildHighlights(session, topIdeas, angleDistribution, durationMinutes, totalVotes),
    generatedAt: new Date().toISOString(),
  };

  return SessionSummarySchema.parse(summary);
}

/** Render a session summary as Markdown for sharing or archival. */
export function sessionSummaryToMarkdown(summary: SessionSummary): string {
  const lines: string[] = [];
  lines.push(`# ${summary.title}`);
  lines.push(`*Generated: ${summary.generatedAt}*`);
  lines.push("");
  lines.push(`**Subject:** ${summary.subject}`);
  lines.push(`**Participants:** ${summary.participantCount}`);
  lines.push(`**Ideas:** ${summary.totalIdeas}`);
  lines.push(`**Votes:** ${summary.totalVotes}`);
  lines.push(`**Duration:** ${summary.durationMinutes} minutes`);
  lines.push("");

  lines.push("## Top Ideas");
  if (summary.topIdeas.length === 0) {
    lines.push("- No ideas were submitted.");
  } else {
    for (const idea of summary.topIdeas) {
      lines.push(`- **${idea.title}** — ${idea.votes} votes (${idea.angleId})`);
    }
  }
  lines.push("");

  lines.push("## Angle Distribution");
  if (summary.angleDistribution.length === 0) {
    lines.push("- No angle activity recorded.");
  } else {
    for (const angle of summary.angleDistribution) {
      lines.push(`- ${angle.angleId}: ${angle.ideaCount} ideas`);
    }
  }
  lines.push("");

  lines.push("## Highlights");
  if (summary.highlights.length === 0) {
    lines.push("- No highlights generated.");
  } else {
    for (const highlight of summary.highlights) {
      lines.push(`- ${highlight}`);
    }
  }

  return lines.join("\n");
}
