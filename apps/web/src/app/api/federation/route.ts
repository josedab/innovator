/**
 * @description Federated innovation across multiple organizations.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getInnovationPulse,
  generateBenchmarks,
  detectIndustryTrends,
  generateAggregateInsights,
  getAggregateInsights,
  getPrivacyBudget,
  setFederationDataResidency as setDataResidency,
  checkDataResidencyCompliance,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers";

const BenchmarkSchema = z.object({
  action: z.literal("benchmark"),
  orgId: z.string().max(100),
  metrics: z.record(z.number()),
});

const TrendsSchema = z.object({
  action: z.literal("trends"),
  patterns: z
    .array(
      z.object({
        angleId: z.string().max(100),
        domain: z.string().max(200),
        frequency: z.number().min(0),
        successRate: z.number().min(0).max(1),
        timestamp: z.string(),
      })
    )
    .max(1000),
});

const ResidencySchema = z.object({
  action: z.literal("residency"),
  orgId: z.string().max(100),
  region: z.enum(["us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "ap-northeast"]),
  allowCrossRegion: z.boolean().optional(),
  retentionDays: z.number().int().optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  BenchmarkSchema,
  TrendsSchema,
  ResidencySchema,
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "pulse") {
      const pulse = getInnovationPulse();
      return NextResponse.json({ pulse }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "insights") {
      const insights = getAggregateInsights();
      return NextResponse.json({ insights }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "privacy-budget") {
      const orgId = searchParams.get("orgId") ?? "default";
      const budget = getPrivacyBudget(orgId);
      return NextResponse.json({ budget }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "compliance") {
      const orgId = searchParams.get("orgId");
      if (!orgId) {
        return NextResponse.json(
          { error: "orgId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const compliance = checkDataResidencyCompliance(orgId);
      return NextResponse.json({ compliance }, { headers: API_RESPONSE_HEADERS });
    }

    // Default: return pulse
    const pulse = getInnovationPulse();
    return NextResponse.json({ pulse }, { headers: API_RESPONSE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    switch (parsed.action) {
      case "benchmark": {
        const benchmarks = generateBenchmarks(parsed.orgId, parsed.metrics);
        return NextResponse.json({ benchmarks }, { headers: API_RESPONSE_HEADERS });
      }

      case "trends": {
        const trends = detectIndustryTrends(parsed.patterns);
        const insights = generateAggregateInsights({
          totalOrgs: 10,
          totalSessions: parsed.patterns.reduce((s, p) => s + p.frequency, 0),
          topAngles: Object.entries(
            parsed.patterns.reduce(
              (acc, p) => {
                acc[p.angleId] = (acc[p.angleId] ?? 0) + p.frequency;
                return acc;
              },
              {} as Record<string, number>
            )
          )
            .map(([angleId, count]) => ({ angleId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
          avgQuality:
            (parsed.patterns.reduce((s, p) => s + p.successRate, 0) /
              Math.max(1, parsed.patterns.length)) *
            10,
        });
        return NextResponse.json({ trends, insights }, { headers: API_RESPONSE_HEADERS });
      }

      case "residency": {
        const config = setDataResidency({
          orgId: parsed.orgId,
          region: parsed.region,
          allowCrossRegion: parsed.allowCrossRegion ?? false,
          retentionDays: parsed.retentionDays ?? 365,
          encryptionRequired: true,
          auditTrailEnabled: true,
        });
        const compliance = checkDataResidencyCompliance(parsed.orgId);
        return NextResponse.json({ config, compliance }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
