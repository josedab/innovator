/**
 * @description Innovation coaching — guided prompts and methodology recommendations.
 */
export const runtime = "nodejs";

import {
  getInnovationProfile,
  recordCoachingSession,
  getProactiveCoaching,
  getCoachingHistory,
  buildTeamProfile,
  getPreSessionCoaching,
  generateCoachingInsights,
  generateClarificationQuestions,
  detectAssumptions,
  recommendPivots,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ProfileSchema = z.object({
  action: z.literal("profile"),
  userId: z.string().min(1).max(200),
});

const CoachingSchema = z.object({
  action: z.literal("coach"),
  userId: z.string().min(1).max(200),
  subject: z.string().min(1).max(5000),
  context: z.enum(["pre-session", "during-session", "post-session"]).optional(),
});

const TeamProfileSchema = z.object({
  action: z.literal("team_profile"),
  teamId: z.string().min(1),
  teamName: z.string().min(1).max(200),
  memberIds: z.array(z.string().min(1)).min(1).max(50),
});

const RecordSessionSchema = z.object({
  action: z.literal("record"),
  userId: z.string().min(1).max(200),
  subject: z.string().min(1).max(5000),
  anglesUsed: z.array(z.string()).min(1),
  ideaCount: z.number().int().min(0),
  avgQuality: z.number().min(0).max(10).optional(),
  duration: z.number().int().min(0).optional(),
});

const InsightsSchema = z.object({
  action: z.literal("insights"),
  teamId: z.string().min(1),
});

const PostBodySchema = z.discriminatedUnion("action", [
  ProfileSchema,
  CoachingSchema,
  TeamProfileSchema,
  RecordSessionSchema,
  InsightsSchema,
]);

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const teamId = searchParams.get("teamId");

  if (userId) {
    const profile = getInnovationProfile(userId);
    const history = getCoachingHistory(userId);
    return Response.json({ profile, history }, { headers: API_RESPONSE_HEADERS });
  }

  if (teamId) {
    try {
      const insights = generateCoachingInsights(teamId);
      return Response.json({ insights }, { headers: API_RESPONSE_HEADERS });
    } catch {
      return Response.json({ error: "Team not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
    }
  }

  return Response.json(
    { error: "Provide userId or teamId parameter" },
    { status: 400, headers: API_RESPONSE_HEADERS }
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: API_RESPONSE_HEADERS });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }

  const data = parsed.data;

  if (data.action === "profile") {
    const profile = getInnovationProfile(data.userId);
    return Response.json({ profile }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "coach") {
    const suggestions = getProactiveCoaching(data.userId, data.subject);
    const questions = await generateClarificationQuestions(data.subject);
    const assumptions = await detectAssumptions(data.subject);
    return Response.json(
      { suggestions, questions, assumptions },
      { headers: API_RESPONSE_HEADERS }
    );
  }

  if (data.action === "team_profile") {
    const profile = buildTeamProfile(data.teamId, data.teamName, data.memberIds);
    return Response.json({ profile }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "record") {
    recordCoachingSession(data.userId, {
      sessionId: `session-${Date.now()}`,
      subject: data.subject,
      anglesUsed: data.anglesUsed,
      ideaCount: data.ideaCount,
      avgQuality: data.avgQuality ?? 5,
      duration: data.duration ?? 0,
      completedAt: new Date().toISOString(),
      exported: false,
    });
    const profile = getInnovationProfile(data.userId);
    return Response.json({ recorded: true, profile }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "insights") {
    const insights = generateCoachingInsights(data.teamId);
    return Response.json({ insights }, { headers: API_RESPONSE_HEADERS });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: API_RESPONSE_HEADERS });
}
