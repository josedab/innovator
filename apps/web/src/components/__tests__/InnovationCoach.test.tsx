/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import InnovationCoach from "../InnovationCoach";

const mockProfile = {
  userId: "user-1",
  preferredAngles: [
    { angleId: "scamper", rank: 1, avgQuality: 8.5, timesUsed: 10 },
    { angleId: "reverse", rank: 2, avgQuality: 7.2, timesUsed: 5 },
  ],
  domainAffinities: { tech: 0.8 },
  qualityTrends: [
    { date: "2024-01-01", avgQuality: 7.0, sessionCount: 3 },
    { date: "2024-01-02", avgQuality: 8.0, sessionCount: 2 },
  ],
  blindSpots: ["angle:biomimicry"],
  creativityStyle: "divergent" as const,
  totalSessions: 15,
  avgQuality: 7.5,
  streakDays: 5,
  level: "intermediate",
  xp: 1200,
};

const mockSkillTree = {
  nodes: [
    {
      id: "s1",
      name: "Divergent Thinking",
      description: "Generate many ideas",
      category: "generation",
      level: "intermediate",
      xpRequired: 500,
      prerequisites: [],
      unlocked: true,
      progress: 75,
    },
  ],
};

const mockStreak = { currentStreak: 5, longestStreak: 10, lastActivityDate: "2024-01-05" };

const mockAchievements = [
  {
    id: "a1",
    name: "First Session",
    description: "Complete your first session",
    icon: "🎯",
    unlockedAt: "2024-01-01T00:00:00Z",
    category: "milestone",
  },
];

const mockLeaderboard = [
  {
    userId: "user-1",
    totalXP: 1200,
    level: "intermediate",
    skillsUnlocked: 3,
    achievementCount: 5,
    rank: 1,
  },
  {
    userId: "user-2",
    totalXP: 800,
    level: "beginner",
    skillsUnlocked: 1,
    achievementCount: 2,
    rank: 2,
  },
];

function createFetchMock(responses: Record<string, unknown>) {
  return vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : {};
    const data = responses[body.action] ?? {};
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    });
  });
}

describe("InnovationCoach", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        profile: { profile: mockProfile },
        skill_tree: { skillTree: mockSkillTree, streak: mockStreak },
        achievements: { achievements: mockAchievements },
        challenge: { activeChallenges: [] },
        leaderboard: { leaderboard: mockLeaderboard },
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders coach panel with title", async () => {
    render(<InnovationCoach userId="user-1" />);
    expect(screen.getByText("🧠 Innovation Coach")).toBeInstanceOf(HTMLElement);
  });

  it("shows loading indicator initially", () => {
    render(<InnovationCoach userId="user-1" />);
    expect(screen.getByText("Loading coach data...")).toBeInstanceOf(HTMLElement);
  });

  it("displays profile data after loading", async () => {
    render(<InnovationCoach userId="user-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading coach data...")).toBeNull();
    });

    expect(screen.getByText("15")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("7.5")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("5d")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("1200")).toBeInstanceOf(HTMLElement);
  });

  it("shows creativity style badge", async () => {
    render(<InnovationCoach userId="user-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading coach data...")).toBeNull();
    });

    expect(screen.getByText("Divergent Thinker")).toBeInstanceOf(HTMLElement);
  });

  it("renders skill tree on skills tab", async () => {
    render(<InnovationCoach userId="user-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading coach data...")).toBeNull();
    });

    const skillsTab = screen.getByText("🌳 Skills");
    fireEvent.click(skillsTab);

    expect(screen.getByText(/Divergent Thinking/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("75%")).toBeInstanceOf(HTMLElement);
  });

  it("renders achievements tab", async () => {
    render(<InnovationCoach userId="user-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading coach data...")).toBeNull();
    });

    const achievementsTab = screen.getByText("🏆 Achievements");
    fireEvent.click(achievementsTab);

    expect(screen.getByText("First Session")).toBeInstanceOf(HTMLElement);
  });

  it("shows onboarding prompt when no profile data", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        profile: {},
        skill_tree: { skillTree: { nodes: [] }, streak: null },
        achievements: { achievements: [] },
      })
    );

    render(<InnovationCoach userId="new-user" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading coach data...")).toBeNull();
    });

    expect(screen.getByText("No profile data yet")).toBeInstanceOf(HTMLElement);
  });

  it("renders leaderboard tab with ranked list", async () => {
    render(<InnovationCoach userId="user-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading coach data...")).toBeNull();
    });

    const leaderboardTab = screen.getByText("📊 Leaderboard");
    fireEvent.click(leaderboardTab);

    await waitFor(() => {
      expect(screen.getByText("📊 Innovation Leaderboard")).toBeInstanceOf(HTMLElement);
    });

    await waitFor(() => {
      expect(screen.getByText("user-1")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("1200 XP")).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders compact mode without title", async () => {
    render(<InnovationCoach userId="user-1" compact />);
    expect(screen.queryByText("🧠 Innovation Coach")).toBeNull();
  });

  it("handles fetch failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    render(<InnovationCoach userId="user-1" />);

    await waitFor(() => {
      expect(screen.queryByText("Loading coach data...")).toBeNull();
    });

    // Should still render without crashing
    expect(screen.getByText("No profile data yet")).toBeInstanceOf(HTMLElement);
  });
});
