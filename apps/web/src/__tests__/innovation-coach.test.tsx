/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InnovationCoach from "../components/InnovationCoach";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockCoachApi(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    profile: {
      profile: {
        userId: "user-1",
        preferredAngles: [{ angleId: "angle-1", rank: 1, avgQuality: 7.5, timesUsed: 10 }],
        domainAffinities: { fintech: 0.8 },
        qualityTrends: [{ date: "2024-01-01", avgQuality: 7.0, sessionCount: 3 }],
        blindSpots: ["angle:underused"],
        creativityStyle: "balanced",
        totalSessions: 25,
        avgQuality: 7.2,
        streakDays: 5,
        level: "intermediate",
        xp: 1200,
      },
    },
    skill_tree: {
      skillTree: {
        nodes: [
          {
            id: "skill-1",
            name: "Deep Research",
            description: "Master deep investigation",
            category: "investigation",
            level: "intermediate",
            xpRequired: 500,
            prerequisites: [],
            unlocked: true,
            progress: 75,
          },
        ],
      },
      streak: { currentStreak: 5, longestStreak: 12, lastActivityDate: "2024-01-15" },
    },
    achievements: {
      achievements: [
        {
          id: "ach-1",
          name: "First Steps",
          description: "Complete first session",
          icon: "🎯",
          unlockedAt: "2024-01-01",
          category: "milestone",
        },
      ],
    },
    challenge: {
      activeChallenges: [
        {
          id: "ch-1",
          title: "Explore New Angles",
          description: "Try 3 new angles",
          durationDays: 7,
          goalCount: 3,
          currentProgress: 1,
          createdAt: "2024-01-10",
        },
      ],
    },
    leaderboard: {
      leaderboard: [
        {
          userId: "user-1",
          totalXP: 1200,
          level: "intermediate",
          skillsUnlocked: 5,
          achievementCount: 3,
          rank: 1,
        },
      ],
    },
  };

  mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : {};
    const action = body.action as string;
    const data = overrides[action] ?? defaults[action] ?? {};
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  });
}

describe("InnovationCoach", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCoachApi();
  });

  it("renders heading in full mode", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.getByText(/Innovation Coach/)).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText(/personalized innovation development/)).toBeInstanceOf(HTMLElement);
  });

  it("does not render heading in compact mode", async () => {
    render(<InnovationCoach compact />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading coach data/)).toBeNull();
    });
    expect(screen.queryByText(/personalized innovation development/)).toBeNull();
  });

  it("renders all five tabs", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading coach data/)).toBeNull();
    });
    expect(screen.getByText(/Profile/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Skills/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Achievements/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Challenges/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Leaderboard/)).toBeInstanceOf(HTMLElement);
  });

  it("shows loading state initially", () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<InnovationCoach />);
    expect(screen.getByText(/Loading coach data/)).toBeInstanceOf(HTMLElement);
  });

  it("renders profile stats", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.getByText("25")).toBeInstanceOf(HTMLElement); // totalSessions
    });
    expect(screen.getByText("7.2")).toBeInstanceOf(HTMLElement); // avgQuality
    expect(screen.getByText("5d")).toBeInstanceOf(HTMLElement); // streak
    expect(screen.getByText("1200")).toBeInstanceOf(HTMLElement); // xp
  });

  it("renders creativity style badge", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.getByText("Balanced Innovator")).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders angle strengths", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.getByText("angle-1")).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders blind spots", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.getByText("underused")).toBeInstanceOf(HTMLElement);
    });
  });

  it("switches to skills tab and renders skill nodes", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading coach data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Skills/));
    expect(screen.getByText(/Deep Research/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("75%")).toBeInstanceOf(HTMLElement);
  });

  it("switches to achievements tab and renders achievements", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading coach data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Achievements/));
    expect(screen.getByText("First Steps")).toBeInstanceOf(HTMLElement);
  });

  it("switches to challenges tab and renders active challenges", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading coach data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Challenges/));
    await waitFor(() => {
      expect(screen.getByText(/Explore New Angles/)).toBeInstanceOf(HTMLElement);
    });
    expect(screen.getByText("1/3 completed")).toBeInstanceOf(HTMLElement);
  });

  it("switches to leaderboard tab and renders entries", async () => {
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading coach data/)).toBeNull();
    });
    fireEvent.click(screen.getByText(/Leaderboard/));
    await waitFor(() => {
      expect(screen.getByText("1200 XP")).toBeInstanceOf(HTMLElement);
    });
  });

  it("renders no profile message when profile is null", async () => {
    mockCoachApi({ profile: {} });
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.getByText(/No profile data yet/)).toBeInstanceOf(HTMLElement);
    });
  });

  it("handles fetch errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<InnovationCoach />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading coach data/)).toBeNull();
    });
    // Should render tabs even if data fails
    expect(screen.getByText(/Profile/)).toBeInstanceOf(HTMLElement);
  });
});
