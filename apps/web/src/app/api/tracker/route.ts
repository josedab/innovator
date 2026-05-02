import { NextResponse } from "next/server";
import { buildDashboard, loadTrackedIdeas } from "@innovator/core";

export async function GET() {
  try {
    const dashboard = buildDashboard();
    const recentIdeas = loadTrackedIdeas().slice(0, 20);
    return NextResponse.json({ dashboard, recentIdeas });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tracker data" },
      { status: 500 }
    );
  }
}
