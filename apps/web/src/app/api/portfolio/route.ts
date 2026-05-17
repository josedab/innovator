/**
 * @description Portfolio analytics — dashboard data, theme clustering, bubble charts, board reports.
 *
 * GET /api/portfolio — returns comprehensive dashboard data
 */

import { NextResponse } from "next/server";
import {
  listSessions,
  buildDashboardData,
  clusterSessionThemes,
  getConversionMetrics,
  listPortfolioItems,
} from "@innovator/core";
import {
  buildBalancedScorecard,
  buildPortfolioBubbleChart,
  generateBoardReport,
  simulatePortfolioRisk,
  generateRebalancingRecommendations,
} from "@innovator/core/dist/portfolio/strategic-intelligence.js";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    const sessions = listSessions();

    if (view === "themes") {
      const themes = clusterSessionThemes(sessions);
      return NextResponse.json({ themes }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "conversion") {
      const conversion = getConversionMetrics();
      return NextResponse.json({ conversion }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "bubble-chart") {
      const items = listPortfolioItems();
      const bubbles = buildPortfolioBubbleChart(items);
      return NextResponse.json(
        { bubbles, totalItems: items.length },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    if (view === "scorecard") {
      const items = listPortfolioItems();
      const scorecard = buildBalancedScorecard(items);
      const risk = simulatePortfolioRisk(items, { simulations: 500 });
      const recs = generateRebalancingRecommendations(items, scorecard);
      return NextResponse.json(
        { scorecard, risk, recommendations: recs },
        { headers: API_RESPONSE_HEADERS }
      );
    }

    if (view === "board-report") {
      const items = listPortfolioItems();
      const period = searchParams.get("period") ?? undefined;
      const title = searchParams.get("title") ?? undefined;
      const format = searchParams.get("format") ?? "json";
      const report = generateBoardReport(items, { title, period });

      if (format === "markdown") {
        return new Response(report, {
          headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown; charset=utf-8" },
        });
      }
      return NextResponse.json({ report }, { headers: API_RESPONSE_HEADERS });
    }

    const dashboardData = buildDashboardData(sessions);
    const themes = clusterSessionThemes(sessions);
    const conversion = getConversionMetrics();

    return NextResponse.json(
      { ...dashboardData, themes, conversion },
      { headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate portfolio report", details: (err as Error).message },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
