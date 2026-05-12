import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getInnovationProfile,
  recordCoachingSession,
  getProactiveCoaching,
  getCoachingHistory,
  buildTeamProfile,
  getTeamProfile,
  getPreSessionCoaching,
  generateCoachingInsights,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers";

const GetProfileSchema = z.object({
  action: z.literal("profile"),
  userId: z.string().max(200),
});

const RecordSessionSchema = z.object({
  action: z.literal("record"),
  userId: z.string().max(200),
  sessionId: z.string().max(100),
  subject: z.string().max(5000),
  anglesUsed: z.array(z.string()).max(20),
  ideaCount: z.number().int().min(0),
  avgQuality: z.number().min(0).max(10),
  duration: z.number().int().min(0),
  exported: z.boolean().default(false),
});

const CoachingSchema = z.object({
  action: z.literal("coaching"),
  userId: z.string().max(200),
  subject: z.string().max(5000).optional(),
  teamId: z.string().max(100).optional(),
});

const TeamProfileSchema = z.object({
  action: z.literal("team-profile"),
  teamId: z.string().max(100),
  teamName: z.string().max(200),
  memberIds: z.array(z.string().max(200)).max(100),
});

const InsightsSchema = z.object({
  action: z.literal("insights"),
  userId: z.string().max(200),
});

const PostBodySchema = z.discriminatedUnion("action", [
  GetProfileSchema,
  RecordSessionSchema,
  CoachingSchema,
  TeamProfileSchema,
  InsightsSchema,
]);

/** GET /api/coaching — retrieve coaching insights, user profiles, or team analytics. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const teamId = searchParams.get("teamId");

    if (teamId) {
      const profile = getTeamProfile(teamId);
      if (!profile) {
        return NextResponse.json(
          { error: "Team profile not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json({ teamProfile: profile }, { headers: API_RESPONSE_HEADERS });
    }

    if (userId) {
      const profile = getInnovationProfile(userId);
      const history = getCoachingHistory(userId);
      const suggestions = getProactiveCoaching(userId);
      return NextResponse.json(
        { profile, history: history.slice(-20), suggestions },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: "Provide userId or teamId" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
}

/** POST /api/coaching — record sessions, build user profiles, or generate team insights. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    switch (parsed.action) {
      case "profile": {
        const profile = getInnovationProfile(parsed.userId);
        return NextResponse.json({ profile }, { headers: API_RESPONSE_HEADERS });
      }

      case "record": {
        const profile = recordCoachingSession(parsed.userId, {
          sessionId: parsed.sessionId,
          subject: parsed.subject,
          anglesUsed: parsed.anglesUsed,
          ideaCount: parsed.ideaCount,
          avgQuality: parsed.avgQuality,
          duration: parsed.duration,
          completedAt: new Date().toISOString(),
          exported: parsed.exported,
        });
        return NextResponse.json(
          { profile, message: "Session recorded" },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "coaching": {
        const suggestions = parsed.subject
          ? getPreSessionCoaching(parsed.userId, parsed.subject, parsed.teamId)
          : getProactiveCoaching(parsed.userId, parsed.subject);
        return NextResponse.json({ suggestions }, { headers: API_RESPONSE_HEADERS });
      }

      case "team-profile": {
        const profile = buildTeamProfile(parsed.teamId, parsed.teamName, parsed.memberIds);
        return NextResponse.json({ teamProfile: profile }, { headers: API_RESPONSE_HEADERS });
      }

      case "insights": {
        const insights = generateCoachingInsights(parsed.userId);
        const profile = getInnovationProfile(parsed.userId);
        return NextResponse.json({ insights, profile }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
