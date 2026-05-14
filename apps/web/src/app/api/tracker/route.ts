/**
 * @description Idea fitness tracker dashboard and recent tracked ideas.
 */
import { NextResponse } from "next/server";
import { buildDashboard, loadTrackedIdeas } from "@innovator/core";

/**
 * Retrieve the tracker dashboard and recent tracked ideas.
 *
 * @route GET /api/tracker
 * @returns JSON `{ dashboard, recentIdeas }` where:
 *   - `dashboard` — aggregated tracker metrics and statistics
 *   - `recentIdeas` — up to 20 most recently tracked ideas
 * @status 500 — failed to load tracker data
 */
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
