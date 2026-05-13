/**
 * @description Real-time Innovation Room for collaborative brainstorming with
 * idea cards, voting, presence indicators, and consensus synthesis.
 */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ---- Types (client-safe, no core imports) ----

interface Participant {
  userId: string;
  displayName: string;
  status: "online" | "away" | "offline";
  cursor?: { x: number; y: number };
}

interface IdeaComment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

interface IdeaCard {
  id: string;
  content: string;
  author: string;
  votes: string[];
  comments: IdeaComment[];
  score: number;
  tags: string[];
  createdAt: string;
}

interface ConsensusStatus {
  reached: boolean;
  ratio: number;
  topIdea: IdeaCard | null;
}

interface InnovationRoomProps {
  userId: string;
  displayName: string;
}

// ---- User Colors ----

const USER_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ---- API Helpers ----

async function roomAction(body: Record<string, unknown>) {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---- Component ----

export default function InnovationRoom({ userId, displayName }: InnovationRoomProps) {
  // Room state
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // Participants & ideas
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [ideas, setIdeas] = useState<IdeaCard[]>([]);
  const [consensus, setConsensus] = useState<ConsensusStatus>({ reached: false, ratio: 0, topIdea: null });
  const [synthesis, setSynthesis] = useState<string | null>(null);

  // UI state
  const [newIdea, setNewIdea] = useState("");
  const [newTags, setNewTags] = useState("");
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [createName, setCreateName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const presenceInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Presence polling ----
  useEffect(() => {
    if (!roomId) return;
    const poll = async () => {
      try {
        const res = await roomAction({ action: "presence", roomId, userId });
        if (res.data?.users) setParticipants(res.data.users);
      } catch { /* ignore */ }

      try {
        const res = await roomAction({ action: "consensus", roomId });
        if (res.data) {
          setConsensus({ reached: res.data.reached, ratio: res.data.ratio, topIdea: res.data.topIdea });
          if (res.data.topIdeas) setIdeas(res.data.topIdeas);
        }
      } catch { /* ignore */ }
    };

    poll();
    presenceInterval.current = setInterval(poll, 5000);
    return () => {
      if (presenceInterval.current) clearInterval(presenceInterval.current);
    };
  }, [roomId, userId]);

  // ---- Actions ----

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await roomAction({
        action: "create_room",
        name: createName.trim(),
        userId,
        displayName,
      });
      if (res.data) {
        setRoomId(res.data.roomId);
        setRoomCode(res.data.code);
        setRoomName(res.data.name);
      } else {
        setError(res.error ?? "Failed to create room");
      }
    } catch {
      setError("Failed to create room");
    } finally {
      setLoading(false);
    }
  }, [createName, userId, displayName]);

  const handleJoin = useCallback(async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await roomAction({
        action: "join_room",
        code: joinCode.trim().toUpperCase(),
        userId,
        displayName,
      });
      if (res.data) {
        setRoomId(res.data.roomId);
        setRoomCode(res.data.code);
        setRoomName(res.data.name);
        setParticipants(res.data.participants ?? []);
        setIdeas(res.data.ideas ?? []);
        if (res.data.consensus) setConsensus(res.data.consensus);
      } else {
        setError(res.error ?? "Room not found");
      }
    } catch {
      setError("Failed to join room");
    } finally {
      setLoading(false);
    }
  }, [joinCode, userId, displayName]);

  const handleAddIdea = useCallback(async () => {
    if (!newIdea.trim() || !roomId) return;
    setLoading(true);
    try {
      const tags = newTags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await roomAction({
        action: "add_idea",
        roomId,
        content: newIdea.trim(),
        author: userId,
        tags: tags.length > 0 ? tags : undefined,
      });
      if (res.data) {
        setIdeas((prev) => [res.data, ...prev]);
        setNewIdea("");
        setNewTags("");
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [newIdea, newTags, roomId, userId]);

  const handleVote = useCallback(async (ideaId: string, value: 1 | -1) => {
    if (!roomId) return;
    await roomAction({ action: "vote", roomId, ideaId, userId, value });
    // Optimistic update
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === ideaId
          ? { ...idea, score: idea.score + value, votes: [...idea.votes, userId] }
          : idea
      )
    );
  }, [roomId, userId]);

  const handleComment = useCallback(async (ideaId: string) => {
    if (!roomId) return;
    const text = commentText[ideaId]?.trim();
    if (!text) return;
    const res = await roomAction({ action: "comment", roomId, ideaId, userId, text });
    if (res.data) {
      setIdeas((prev) =>
        prev.map((idea) =>
          idea.id === ideaId
            ? { ...idea, comments: [...idea.comments, res.data] }
            : idea
        )
      );
      setCommentText((prev) => ({ ...prev, [ideaId]: "" }));
    }
  }, [roomId, userId, commentText]);

  const handleSynthesize = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const res = await roomAction({ action: "synthesize", roomId });
      if (res.data?.synthesis) setSynthesis(res.data.synthesis);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [roomId]);

  // ---- Lobby (no room joined yet) ----
  if (!roomId) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-100">🚀 Innovation Room</h2>

        {error && (
          <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Create */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Create a new room</label>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Room name (e.g. Q4 Brainstorm)"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={loading || !createName.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating…" : "Create Room"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-xs text-gray-500">or</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Join */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Join with room code</label>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. A3K9M2"
              maxLength={6}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-600"
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button
              onClick={handleJoin}
              disabled={loading || !joinCode.trim()}
              className="px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Active Room ----
  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 rounded-lg border border-gray-800">
        <div>
          <h2 className="text-lg font-bold text-gray-100">{roomName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
              {roomCode}
            </span>
            <span className="text-xs text-gray-500">
              {ideas.length} idea{ideas.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Participant avatars */}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {participants.map((p) => (
              <div
                key={p.userId}
                className="relative w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs text-white font-bold"
                style={{ backgroundColor: getUserColor(p.userId) }}
                title={`${p.displayName} (${p.status})`}
              >
                {p.displayName.charAt(0).toUpperCase()}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-gray-900 ${
                    p.status === "online"
                      ? "bg-green-500"
                      : p.status === "away"
                        ? "bg-yellow-500"
                        : "bg-gray-500"
                  }`}
                />
              </div>
            ))}
          </div>
          <span className="text-xs text-gray-500">
            {participants.filter((p) => p.status === "online").length} online
          </span>
        </div>
      </div>

      {/* Consensus Progress */}
      <div className="px-4 py-3 bg-gray-900 rounded-lg border border-gray-800">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-400">Consensus Progress</span>
          <span className="text-xs text-gray-500">{Math.round(consensus.ratio * 100)}%</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              consensus.reached ? "bg-green-500" : "bg-blue-600"
            }`}
            style={{ width: `${Math.min(100, consensus.ratio * 100)}%` }}
          />
        </div>
        {consensus.reached && (
          <p className="text-xs text-green-400 mt-1">
            ✅ Consensus reached! Ready to synthesize.
          </p>
        )}
      </div>

      {/* Add Idea */}
      <div className="px-4 py-3 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
        <textarea
          value={newIdea}
          onChange={(e) => setNewIdea(e.target.value)}
          placeholder="Share your idea…"
          rows={2}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <div className="flex gap-2">
          <input
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            onClick={handleAddIdea}
            disabled={loading || !newIdea.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Idea
          </button>
        </div>
      </div>

      {/* Idea Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ideas.map((idea) => {
          const hasVoted = idea.votes.includes(userId);
          const isExpanded = showComments[idea.id] ?? false;
          return (
            <div
              key={idea.id}
              className="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-2"
            >
              {/* Content */}
              <p className="text-sm text-gray-100">{idea.content}</p>

              {/* Tags */}
              {idea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {idea.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Vote + meta row */}
              <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVote(idea.id, 1)}
                    disabled={hasVoted}
                    className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-green-900/40 text-green-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    👍 +1
                  </button>
                  <button
                    onClick={() => handleVote(idea.id, -1)}
                    disabled={hasVoted}
                    className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-red-900/40 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    👎 -1
                  </button>
                  <span
                    className={`text-xs font-bold ${
                      idea.score > 0 ? "text-green-400" : idea.score < 0 ? "text-red-400" : "text-gray-500"
                    }`}
                  >
                    {idea.score > 0 ? "+" : ""}
                    {idea.score}
                  </span>
                </div>
                <button
                  onClick={() =>
                    setShowComments((prev) => ({ ...prev, [idea.id]: !prev[idea.id] }))
                  }
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  💬 {idea.comments.length}
                </button>
              </div>

              {/* Comments */}
              {isExpanded && (
                <div className="space-y-2 pt-2 border-t border-gray-800">
                  {idea.comments.map((c) => (
                    <div key={c.id} className="text-xs text-gray-400">
                      <span className="font-medium text-gray-300">{c.userId}</span>: {c.text}
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <input
                      value={commentText[idea.id] ?? ""}
                      onChange={(e) =>
                        setCommentText((prev) => ({ ...prev, [idea.id]: e.target.value }))
                      }
                      placeholder="Add comment…"
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                      onKeyDown={(e) => e.key === "Enter" && handleComment(idea.id)}
                    />
                    <button
                      onClick={() => handleComment(idea.id)}
                      className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ideas.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No ideas yet. Be the first to share one!
        </div>
      )}

      {/* Synthesize */}
      {!synthesis && ideas.length > 0 && (
        <button
          onClick={handleSynthesize}
          disabled={loading}
          className={`w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            consensus.reached
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loading ? "Synthesizing…" : "🧬 Synthesize Ideas"}
        </button>
      )}

      {/* Synthesis Result */}
      {synthesis && (
        <div className="px-4 py-3 bg-gray-900 rounded-lg border border-green-800 space-y-2">
          <h3 className="text-sm font-bold text-green-400">🧬 Synthesis</h3>
          <div className="text-sm text-gray-300 whitespace-pre-wrap">{synthesis}</div>
        </div>
      )}
    </div>
  );
}
