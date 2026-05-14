/**
 * @description Federation DP — differential privacy pattern sharing,
 * recommendations, and privacy budget management.
 */
export const runtime = "nodejs";

import {
  loadFederationPrivacyBudget as loadBudget,
  getRemainingFederationBudget as getRemaining,
  loadSharedPatterns,
  generateFederationRecommendations,
  detectFederationAntiPatterns,
  computeFederationNetworkStats,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RecommendSchema = z.object({
  action: z.literal("recommend"),
  userTopics: z.array(z.string().min(1).max(200)).min(1),
  userAngles: z.array(z.string().max(100)).default([]),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") ?? "budget";

    if (action === "budget") {
      const budget = loadBudget();
      const remaining = getRemaining();
      return Response.json(
        { ...budget, remaining },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    if (action === "patterns") {
      const patterns = loadSharedPatterns();
      return Response.json(
        { patterns, count: patterns.length },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    if (action === "anti-patterns") {
      const patterns = loadSharedPatterns();
      const antiPatterns = detectFederationAntiPatterns(patterns);
      return Response.json({ antiPatterns }, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (action === "network-stats") {
      const patterns = loadSharedPatterns();
      const stats = computeFederationNetworkStats(patterns);
      return Response.json(stats, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    const budget = loadBudget();
    return Response.json(budget, { status: 200, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Federation DP query failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "recommend") {
      const parsed = RecommendSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid request", details: parsed.error.issues },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const patterns = loadSharedPatterns();
      const recommendations = generateFederationRecommendations(
        parsed.data.userTopics,
        parsed.data.userAngles,
        patterns
      );
      return Response.json({ recommendations }, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    return Response.json(
      { error: "Unknown action. Use 'recommend'" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Federation DP operation failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
