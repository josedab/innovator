/**
 * @description AI Innovation Coach with personalized learning paths,
 * skill trees, proactive coaching, and achievement tracking.
 */
export const runtime = "nodejs";

import { z } from "zod";
import { NextResponse } from "next/server";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import {
  getInnovationProfileBuilder,
  getProactiveCoachingEngine,
  getSkillTreeManager,
} from "@innovator/core";

// ---- Schemas ----

const ProfileActionSchema = z.object({
  action: z.literal("profile"),
  userId: z.string().min(1).max(200),
  sessionHistory: z
    .array(
      z.object({
        sessionId: z.string(),
        subject: z.string(),
        domain: z.string().optional(),
        anglesUsed: z.array(z.string()),
        ideaCount: z.number(),
        avgQuality: z.number(),
        feasibility: z.number().optional(),
        novelty: z.number().optional(),
        impact: z.number().optional(),
        duration: z.number(),
        completedAt: z.string(),
      })
    )
    .optional(),
});

const RecommendationsSchema = z.object({
  action: z.literal("recommendations"),
  userId: z.string().min(1).max(200),
  subject: z.string().min(1).max(5000),
});

const NudgesSchema = z.object({
  action: z.literal("nudges"),
  userId: z.string().min(1).max(200),
  context: z.object({
    sessionId: z.string(),
    subject: z.string(),
    domain: z.string().optional(),
    currentAngles: z.array(z.string()),
    elapsedTime: z.number(),
    ideasGenerated: z.number(),
    qualityScores: z.array(z.number()),
  }),
});

const AnalysisSchema = z.object({
  action: z.literal("analysis"),
  userId: z.string().min(1).max(200),
  sessionResult: z.object({
    sessionId: z.string(),
    subject: z.string(),
    domain: z.string().optional(),
    anglesUsed: z.array(z.string()),
    ideaCount: z.number(),
    avgQuality: z.number(),
    feasibility: z.number().optional(),
    novelty: z.number().optional(),
    impact: z.number().optional(),
    duration: z.number(),
    completedAt: z.string(),
  }),
});

const SkillTreeSchema = z.object({
  action: z.literal("skill_tree"),
  userId: z.string().min(1).max(200),
});

const AchievementsSchema = z.object({
  action: z.literal("achievements"),
  userId: z.string().min(1).max(200),
});

const LeaderboardSchema = z.object({
  action: z.literal("leaderboard"),
  teamId: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const ChallengeSchema = z.object({
  action: z.literal("challenge"),
  userId: z.string().min(1).max(200),
});

const PostBodySchema = z.discriminatedUnion("action", [
  ProfileActionSchema,
  RecommendationsSchema,
  NudgesSchema,
  AnalysisSchema,
  SkillTreeSchema,
  AchievementsSchema,
  LeaderboardSchema,
  ChallengeSchema,
]);

// ---- Handlers ----

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const data = parsed.data;
  const builder = getInnovationProfileBuilder();
  const coach = getProactiveCoachingEngine();
  const skillTree = getSkillTreeManager();

  switch (data.action) {
    case "profile": {
      if (data.sessionHistory && data.sessionHistory.length > 0) {
        const profile = builder.buildProfile(
          data.userId,
          data.sessionHistory as Parameters<typeof builder.buildProfile>[1]
        );
        const metrics = builder.getMetrics(data.userId);
        const trajectory = builder.getGrowthTrajectory(profile);
        return NextResponse.json(
          { profile, metrics, trajectory },
          { headers: API_RESPONSE_HEADERS }
        );
      }
      const existing = builder.getProfile(data.userId);
      const metrics = builder.getMetrics(data.userId);
      return NextResponse.json(
        { profile: existing ?? null, metrics },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    case "recommendations": {
      const recommendations = coach.getPreSessionRecommendations(
        data.userId,
        data.subject
      );
      return NextResponse.json(
        { recommendations },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    case "nudges": {
      const nudges = coach.getMidSessionNudges(
        data.userId,
        data.context as Parameters<typeof coach.getMidSessionNudges>[1]
      );
      return NextResponse.json({ nudges }, { headers: API_RESPONSE_HEADERS });
    }

    case "analysis": {
      const result = data.sessionResult as Parameters<typeof coach.getPostSessionAnalysis>[1];
      const analysis = coach.getPostSessionAnalysis(data.userId, result);
      builder.updateProfile(data.userId, result);
      skillTree.getSkillTree(data.userId);
      const xpResult = skillTree.awardXP(
        data.userId,
        analysis.xpEarned,
        "session-complete"
      );
      const newSkills = skillTree.checkUnlocks(data.userId, {
        anglesUsed: data.sessionResult.anglesUsed,
        ideaCount: data.sessionResult.ideaCount,
        avgQuality: data.sessionResult.avgQuality,
        duration: data.sessionResult.duration,
      });
      skillTree.updateStreak(data.userId);
      return NextResponse.json(
        { analysis, xp: xpResult, newSkills, streak: skillTree.getStreak(data.userId) },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    case "skill_tree": {
      const tree = skillTree.getSkillTree(data.userId);
      const streak = skillTree.getStreak(data.userId);
      return NextResponse.json(
        { skillTree: tree, streak },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    case "achievements": {
      const achievements = skillTree.getAchievements(data.userId);
      return NextResponse.json(
        { achievements },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    case "leaderboard": {
      const leaderboard = skillTree.getLeaderboard(data.teamId, data.limit);
      return NextResponse.json(
        { leaderboard },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    case "challenge": {
      const challenge = coach.generateChallenge(data.userId);
      const activeChallenges = coach.getActiveChallenges(data.userId);
      return NextResponse.json(
        { challenge, activeChallenges },
        { headers: API_RESPONSE_HEADERS }
      );
    }
  }
}
