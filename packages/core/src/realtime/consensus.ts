/**
 * @module realtime/consensus
 *
 * Consensus and synthesis for collaborative innovation rooms.
 * Manages idea cards, voting sessions, consensus detection,
 * and auto-synthesis of parallel contributions.
 */

import { randomUUID } from "node:crypto";

// ---- Types ----

/** A comment on an idea card. */
export interface IdeaCardComment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

/** An idea card in a consensus session. */
export interface IdeaCard {
  id: string;
  content: string;
  author: string;
  votes: string[];
  comments: IdeaCardComment[];
  score: number;
  tags: string[];
  createdAt: string;
}

/** A recorded event for session replay. */
export interface ConsensusEvent {
  type:
    | "idea_added"
    | "vote_cast"
    | "comment_added"
    | "voting_opened"
    | "voting_closed"
    | "synthesized";
  timestamp: string;
  userId?: string;
  payload: Record<string, unknown>;
}

/** A consensus voting session within a room. */
export interface ConsensusSession {
  id: string;
  roomId: string;
  ideas: Map<string, IdeaCard>;
  votingOpen: boolean;
  /** Fraction of participants that must agree (0–1). */
  consensusThreshold: number;
  synthesizedResult: string | null;
  events: ConsensusEvent[];
  createdAt: string;
}

// ---- Consensus Manager ----

export class ConsensusManager {
  private sessions = new Map<string, ConsensusSession>();

  /** Create a new consensus session for a room. */
  createSession(roomId: string, threshold = 0.6): ConsensusSession {
    const session: ConsensusSession = {
      id: randomUUID(),
      roomId,
      ideas: new Map(),
      votingOpen: true,
      consensusThreshold: Math.max(0, Math.min(1, threshold)),
      synthesizedResult: null,
      events: [],
      createdAt: new Date().toISOString(),
    };

    this.recordEvent(session, {
      type: "voting_opened",
      timestamp: session.createdAt,
      payload: { threshold: session.consensusThreshold },
    });

    this.sessions.set(session.id, session);
    return session;
  }

  /** Add an idea card to a session. */
  addIdea(
    sessionId: string,
    idea: { content: string; author: string; tags?: string[] }
  ): IdeaCard | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const card: IdeaCard = {
      id: randomUUID(),
      content: idea.content,
      author: idea.author,
      votes: [],
      comments: [],
      score: 0,
      tags: idea.tags ?? [],
      createdAt: new Date().toISOString(),
    };

    session.ideas.set(card.id, card);

    this.recordEvent(session, {
      type: "idea_added",
      timestamp: card.createdAt,
      userId: idea.author,
      payload: { ideaId: card.id, content: idea.content },
    });

    return card;
  }

  /** Cast a vote on an idea (+1 or -1). Each user can vote once per idea. */
  vote(sessionId: string, ideaId: string, userId: string, value: 1 | -1): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.votingOpen) return false;

    const idea = session.ideas.get(ideaId);
    if (!idea) return false;

    // Prevent duplicate votes
    if (idea.votes.includes(userId)) return false;

    idea.votes.push(userId);
    idea.score += value;

    this.recordEvent(session, {
      type: "vote_cast",
      timestamp: new Date().toISOString(),
      userId,
      payload: { ideaId, value, newScore: idea.score },
    });

    return true;
  }

  /** Add a comment to an idea. */
  comment(
    sessionId: string,
    ideaId: string,
    userId: string,
    text: string
  ): IdeaCardComment | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const idea = session.ideas.get(ideaId);
    if (!idea) return undefined;

    const comment: IdeaCardComment = {
      id: randomUUID(),
      userId,
      text,
      createdAt: new Date().toISOString(),
    };

    idea.comments.push(comment);

    this.recordEvent(session, {
      type: "comment_added",
      timestamp: comment.createdAt,
      userId,
      payload: { ideaId, commentId: comment.id, text },
    });

    return comment;
  }

  /** Get the top-scored ideas. */
  getTopIdeas(sessionId: string, limit = 10): IdeaCard[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.ideas.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Check if consensus has been reached.
   * Consensus = at least one idea has votes from ≥ threshold fraction of unique voters.
   */
  checkConsensus(sessionId: string): { reached: boolean; topIdea: IdeaCard | null; ratio: number } {
    const session = this.sessions.get(sessionId);
    if (!session) return { reached: false, topIdea: null, ratio: 0 };

    // Collect unique voters across all ideas
    const allVoters = new Set<string>();
    for (const idea of session.ideas.values()) {
      for (const voter of idea.votes) {
        allVoters.add(voter);
      }
    }

    if (allVoters.size === 0) return { reached: false, topIdea: null, ratio: 0 };

    // Find idea with most votes
    const top = this.getTopIdeas(sessionId, 1)[0] ?? null;
    if (!top) return { reached: false, topIdea: null, ratio: 0 };

    const ratio = top.votes.length / allVoters.size;
    return {
      reached: ratio >= session.consensusThreshold,
      topIdea: top,
      ratio,
    };
  }

  /** Auto-synthesize parallel contributions into a summary. */
  synthesize(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const ranked = this.getTopIdeas(sessionId, 50);
    if (ranked.length === 0) return undefined;

    // Build synthesis from top ideas
    const topIdeas = ranked.slice(0, 5);
    const lines: string[] = [
      `## Innovation Room Synthesis`,
      ``,
      `**${ranked.length} ideas submitted** · Top ${topIdeas.length} by consensus:`,
      ``,
    ];

    for (let i = 0; i < topIdeas.length; i++) {
      const idea = topIdeas[i];
      const commentCount = idea.comments.length;
      lines.push(
        `${i + 1}. **${idea.content}** (score: ${idea.score}, votes: ${idea.votes.length}${commentCount > 0 ? `, ${commentCount} comments` : ""})`
      );
      if (idea.tags.length > 0) {
        lines.push(`   Tags: ${idea.tags.join(", ")}`);
      }
    }

    // Common themes from tags
    const tagCounts = new Map<string, number>();
    for (const idea of ranked) {
      for (const tag of idea.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topTags.length > 0) {
      lines.push(``, `**Common themes:** ${topTags.map(([t, c]) => `${t} (${c})`).join(", ")}`);
    }

    const synthesis = lines.join("\n");
    session.synthesizedResult = synthesis;
    session.votingOpen = false;

    this.recordEvent(session, {
      type: "synthesized",
      timestamp: new Date().toISOString(),
      payload: { ideaCount: ranked.length, topIdeaCount: topIdeas.length },
    });

    return synthesis;
  }

  /** Get the time-ordered event log for session replay. */
  getSessionRecording(sessionId: string): ConsensusEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return [...session.events];
  }

  /** Get a session by ID. */
  getSession(sessionId: string): ConsensusSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Delete a session (for testing/cleanup). */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /** Clear all sessions (for testing). */
  clear(): void {
    this.sessions.clear();
  }

  // ---- Private helpers ----

  private recordEvent(session: ConsensusSession, event: ConsensusEvent): void {
    session.events.push(event);
  }
}
