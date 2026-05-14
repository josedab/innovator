/**
 * @description Portfolio analytics — dashboard data and theme clustering.
 *
 * GET /api/portfolio — returns comprehensive dashboard data
 * POST /api/portfolio — theme clustering, conversion metrics
 */

import { NextResponse } from "next/server";
import {
  listSessions,
  buildDashboardData,
  clusterSessionThemes,
  getConversionMetrics,
} from "@innovator/core";
import { z } from "zod";
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
