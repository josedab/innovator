/**
 * Portfolio analytics API route.
 * GET /api/portfolio — returns comprehensive dashboard data
 */

import { NextResponse } from "next/server";
import { listSessions, buildDashboardData } from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

export async function GET() {
  try {
    const sessions = listSessions();
    const dashboardData = buildDashboardData(sessions);

    return NextResponse.json(dashboardData, { headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate portfolio report", details: (err as Error).message },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
