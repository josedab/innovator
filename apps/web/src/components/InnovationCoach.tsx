/**
 * @description AI Innovation Coach dashboard with profile, skills, achievements, challenges, and leaderboard.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

// ---- Types ----

interface AngleStrength {
  angleId: string;
  rank: number;
  avgQuality: number;
  timesUsed: number;
}

interface QualityTrend {
  date: string;
  avgQuality: number;
  sessionCount: number;
}

interface ProfileData {
  userId: string;
  preferredAngles: AngleStrength[];
  domainAffinities: Record<string, number>;
  qualityTrends: QualityTrend[];
  blindSpots: string[];
  creativityStyle: "divergent" | "convergent" | "balanced";
  totalSessions: number;
  avgQuality: number;
  streakDays: number;
  level: string;
  xp: number;
}

interface SkillNode {
  id: string;
  name: string;
  description: string;
  category: string;
  level: string;
  xpRequired: number;
  prerequisites: string[];
  unlocked: boolean;
  progress: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  category: string;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  targetAngle?: string;
  durationDays: number;
  goalCount: number;
  currentProgress: number;
  createdAt: string;
}

interface LeaderboardEntry {
  userId: string;
  totalXP: number;
  level: string;
  skillsUnlocked: number;
  achievementCount: number;
  rank: number;
}

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

type CoachTab = "profile" | "skills" | "achievements" | "challenges" | "leaderboard";

interface InnovationCoachProps {
  userId?: string;
  compact?: boolean;
}

// ---- Helpers ----

const CATEGORY_COLORS: Record<string, string> = {
  investigation: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  generation: "text-green-400 bg-green-400/10 border-green-400/30",
  synthesis: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  debate: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  collaboration: "text-pink-400 bg-pink-400/10 border-pink-400/30",
};

const STYLE_BADGES: Record<string, { label: string; icon: string; color: string }> = {
  divergent: { label: "Divergent Thinker", icon: "🌊", color: "text-cyan-400" },
  convergent: { label: "Convergent Thinker", icon: "🎯", color: "text-amber-400" },
  balanced: { label: "Balanced Innovator", icon: "⚖️", color: "text-emerald-400" },
};

const LEVEL_COLORS: Record<string, string> = {
  beginner: "text-gray-400",
  intermediate: "text-blue-400",
  advanced: "text-purple-400",
  expert: "text-yellow-400",
};

// ---- Component ----

export default function InnovationCoach({
  userId = "default-user",
  compact = false,
}: InnovationCoachProps) {
  const [tab, setTab] = useState<CoachTab>("profile");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [skills, setSkills] = useState<SkillNode[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/innovation-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", userId }),
      });
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
    } catch {
      /* non-critical */
    }
  }, [userId]);

  const fetchSkillTree = useCallback(async () => {
    try {
      const res = await fetch("/api/innovation-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skill_tree", userId }),
      });
      const data = await res.json();
      if (data.skillTree?.nodes) setSkills(data.skillTree.nodes);
      if (data.streak) setStreak(data.streak);
    } catch {
      /* non-critical */
    }
  }, [userId]);

  const fetchAchievements = useCallback(async () => {
    try {
      const res = await fetch("/api/innovation-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "achievements", userId }),
      });
      const data = await res.json();
      if (data.achievements) setAchievements(data.achievements);
    } catch {
      /* non-critical */
    }
  }, [userId]);

  const fetchChallenges = useCallback(async () => {
    try {
      const res = await fetch("/api/innovation-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge", userId }),
      });
      const data = await res.json();
      if (data.activeChallenges) setChallenges(data.activeChallenges);
    } catch {
      /* non-critical */
    }
  }, [userId]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch("/api/innovation-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leaderboard", limit: 20 }),
      });
      const data = await res.json();
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      void Promise.all([fetchProfile(), fetchSkillTree(), fetchAchievements()]).finally(() =>
        setLoading(false)
      );
    });
  }, [fetchProfile, fetchSkillTree, fetchAchievements]);

  useEffect(() => {
    queueMicrotask(() => {
      if (tab === "challenges") {
        void fetchChallenges();
      }
      if (tab === "leaderboard") {
        void fetchLeaderboard();
      }
    });
  }, [tab, fetchChallenges, fetchLeaderboard]);

  const TABS: { id: CoachTab; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "skills", label: "Skills", icon: "🌳" },
    { id: "achievements", label: "Achievements", icon: "🏆" },
    { id: "challenges", label: "Challenges", icon: "⚡" },
    { id: "leaderboard", label: "Leaderboard", icon: "📊" },
  ];

  return (
    <div className={`bg-gray-950 text-white ${compact ? "" : "min-h-screen"}`}>
      <div className={compact ? "px-4 py-4" : "max-w-7xl mx-auto px-6 py-8"}>
        {!compact && (
          <>
            <h1 className="text-3xl font-bold mb-2">🧠 Innovation Coach</h1>
            <p className="text-gray-400 mb-8">Your personalized innovation development dashboard</p>
          </>
        )}

        {/* Tabs */}
        <div
          className={`flex gap-1 mb-6 bg-gray-900 p-1 rounded-xl ${compact ? "overflow-x-auto" : "w-fit"}`}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                tab === t.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {t.icon} {compact ? "" : t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-12 text-gray-500">Loading coach data...</div>}

        {!loading && (
          <>
            {/* Profile Tab */}
            {tab === "profile" && (
              <div className="space-y-6">
                {profile ? (
                  <>
                    {/* Stats Row */}
                    <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-4"} gap-4`}>
                      {[
                        { label: "Sessions", value: profile.totalSessions, color: "text-blue-400" },
                        {
                          label: "Avg Quality",
                          value: profile.avgQuality.toFixed(1),
                          color: "text-green-400",
                        },
                        {
                          label: "Streak",
                          value: `${profile.streakDays}d`,
                          color: "text-orange-400",
                        },
                        { label: "XP", value: profile.xp, color: "text-purple-400" },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="bg-gray-900 rounded-xl border border-gray-800 p-4"
                        >
                          <div className={`text-2xl font-bold ${stat.color}`}>
                            {String(stat.value)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Creativity Style Badge */}
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">
                          {STYLE_BADGES[profile.creativityStyle]?.icon ?? "⚖️"}
                        </span>
                        <div>
                          <div
                            className={`font-semibold ${STYLE_BADGES[profile.creativityStyle]?.color ?? ""}`}
                          >
                            {STYLE_BADGES[profile.creativityStyle]?.label ?? "Balanced"}
                          </div>
                          <div className="text-xs text-gray-500">
                            Level:{" "}
                            <span className={LEVEL_COLORS[profile.level] ?? ""}>
                              {profile.level}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Radar Chart (CSS-based) */}
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                      <h3 className="font-semibold mb-4 text-sm">Angle Strengths</h3>
                      <div className="space-y-2">
                        {profile.preferredAngles.slice(0, 8).map((angle) => {
                          const maxQuality = Math.max(
                            ...profile.preferredAngles.map((a) => a.avgQuality),
                            1
                          );
                          const width = (angle.avgQuality / maxQuality) * 100;
                          return (
                            <div key={angle.angleId} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-28 truncate">
                                {angle.angleId}
                              </span>
                              <div className="flex-1 bg-gray-800 rounded-full h-2">
                                <div
                                  className="bg-blue-500 rounded-full h-2 transition-all"
                                  style={{ width: `${Math.max(width, 4)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-8 text-right">
                                {angle.avgQuality.toFixed(1)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Quality Trends */}
                    {profile.qualityTrends.length > 0 && (
                      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                        <h3 className="font-semibold mb-4 text-sm">Quality Trend</h3>
                        <div className="flex items-end gap-1 h-24">
                          {profile.qualityTrends.slice(-20).map((point, i) => {
                            const height = (point.avgQuality / 10) * 100;
                            return (
                              <div
                                key={i}
                                className="flex-1 bg-green-600 rounded-t hover:bg-green-500 transition relative group"
                                style={{ height: `${Math.max(height, 4)}%` }}
                              >
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                                  {point.date}: {point.avgQuality.toFixed(1)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Blind Spots */}
                    {profile.blindSpots.length > 0 && (
                      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                        <h3 className="font-semibold mb-3 text-sm">🔍 Blind Spots</h3>
                        <div className="flex flex-wrap gap-2">
                          {profile.blindSpots.map((spot) => (
                            <span
                              key={spot}
                              className="px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded-full border border-red-500/20"
                            >
                              {spot.replace("angle:", "").replace("domain:", "")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg mb-2">No profile data yet</p>
                    <p className="text-sm">
                      Complete your first innovation session to build your profile.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Skills Tab */}
            {tab === "skills" && (
              <div className="space-y-4">
                {(
                  ["investigation", "generation", "synthesis", "debate", "collaboration"] as const
                ).map((category) => {
                  const categorySkills = skills.filter((s) => s.category === category);
                  if (categorySkills.length === 0) return null;
                  const colors = CATEGORY_COLORS[category] ?? "";
                  return (
                    <div
                      key={category}
                      className="bg-gray-900 rounded-xl border border-gray-800 p-4"
                    >
                      <h3 className="font-semibold mb-3 text-sm capitalize">{category}</h3>
                      <div
                        className={`grid ${compact ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-4"} gap-3`}
                      >
                        {categorySkills.map((skill) => (
                          <div
                            key={skill.id}
                            className={`rounded-lg border p-3 transition ${
                              skill.unlocked ? colors : "bg-gray-800/50 border-gray-700 opacity-60"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">
                                {skill.unlocked ? "✅" : "🔒"} {skill.name}
                              </span>
                              <span
                                className={`text-xs ${LEVEL_COLORS[skill.level] ?? "text-gray-500"}`}
                              >
                                {skill.level}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                              {skill.description}
                            </p>
                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  skill.unlocked ? "bg-green-500" : "bg-gray-500"
                                }`}
                                style={{ width: `${skill.progress}%` }}
                              />
                            </div>
                            <div className="text-xs text-gray-600 mt-1">{skill.progress}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {skills.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No skill data available yet. Complete sessions to unlock skills.
                  </div>
                )}
              </div>
            )}

            {/* Achievements Tab */}
            {tab === "achievements" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <h3 className="font-semibold mb-4">🏆 Achievements ({achievements.length})</h3>
                {achievements.length > 0 ? (
                  <div
                    className={`grid ${compact ? "grid-cols-2" : "grid-cols-3 lg:grid-cols-5"} gap-3`}
                  >
                    {achievements.map((ach) => (
                      <div
                        key={ach.id}
                        className="bg-gray-800/50 rounded-xl border border-gray-700 p-3 text-center hover:border-yellow-500/30 transition"
                      >
                        <div className="text-3xl mb-2">{ach.icon}</div>
                        <div className="text-sm font-medium mb-1">{ach.name}</div>
                        <p className="text-xs text-gray-500 line-clamp-2">{ach.description}</p>
                        {ach.unlockedAt && (
                          <div className="text-xs text-gray-600 mt-2">
                            {new Date(ach.unlockedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-4xl mb-3">🎯</p>
                    <p>No achievements yet. Start innovating to earn badges!</p>
                  </div>
                )}
              </div>
            )}

            {/* Challenges Tab */}
            {tab === "challenges" && (
              <div className="space-y-4">
                {/* Streak Counter */}
                {streak && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">🔥</span>
                      <div>
                        <div className="font-semibold">{streak.currentStreak} Day Streak</div>
                        <div className="text-xs text-gray-500">
                          Longest: {streak.longestStreak} days
                        </div>
                      </div>
                    </div>
                    {streak.lastActivityDate && (
                      <div className="text-xs text-gray-600">
                        Last active: {streak.lastActivityDate}
                      </div>
                    )}
                  </div>
                )}

                {/* Active Challenges */}
                {challenges.length > 0 ? (
                  challenges.map((ch) => (
                    <div key={ch.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">⚡ {ch.title}</h4>
                        <span className="text-xs text-gray-500">{ch.durationDays}d remaining</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">{ch.description}</p>
                      <div className="w-full bg-gray-700 rounded-full h-2 mb-1">
                        <div
                          className="bg-yellow-500 rounded-full h-2 transition-all"
                          style={{
                            width: `${Math.min((ch.currentProgress / ch.goalCount) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <div className="text-xs text-gray-600">
                        {ch.currentProgress}/{ch.goalCount} completed
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-4xl mb-3">⚡</p>
                    <p>No active challenges. New challenges are generated based on your profile.</p>
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard Tab */}
            {tab === "leaderboard" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <h3 className="font-semibold mb-4">📊 Innovation Leaderboard</h3>
                {leaderboard.length > 0 ? (
                  <div className="space-y-2">
                    {leaderboard.map((entry) => (
                      <div
                        key={entry.userId}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg transition ${
                          entry.userId === userId
                            ? "bg-blue-500/10 border border-blue-500/30"
                            : "bg-gray-800/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-lg font-bold ${
                              entry.rank <= 3 ? "text-yellow-400" : "text-gray-500"
                            }`}
                          >
                            {entry.rank === 1
                              ? "🥇"
                              : entry.rank === 2
                                ? "🥈"
                                : entry.rank === 3
                                  ? "🥉"
                                  : `#${entry.rank}`}
                          </span>
                          <div>
                            <span className="font-medium text-sm">{entry.userId}</span>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span className={LEVEL_COLORS[entry.level] ?? ""}>{entry.level}</span>
                              <span>·</span>
                              <span>{entry.skillsUnlocked} skills</span>
                              <span>·</span>
                              <span>{entry.achievementCount} 🏆</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-blue-400 font-semibold text-sm">
                          {entry.totalXP} XP
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-4xl mb-3">📊</p>
                    <p>No leaderboard data yet. Complete sessions to appear on the leaderboard.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
