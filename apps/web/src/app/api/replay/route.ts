/**
 * @description Session replay — step-through visualization of pipeline execution.
 */
export const runtime = "nodejs";

import {
  getRunRecord,
  buildTimeline,
  getSnapshot,
  forkRun,
  listBranchesForRun,
  buildBranchDiff,
  timeTravel,
  loadPersistedRuns,
  recordDecisionPoint,
  getDecisionPoints,
  branchFromDecision,
  getSessionTree,
  compareBranches,
  buildTimelineView,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const TimelineSchema = z.object({
  action: z.literal("timeline"),
  runId: z.string().min(1),
});

const SnapshotSchema = z.object({
  action: z.literal("snapshot"),
  runId: z.string().min(1),
  index: z.number().int().min(0),
});

const ForkSchema = z.object({
  action: z.literal("fork"),
  runId: z.string().min(1),
  snapshotIndex: z.number().int().min(0),
  label: z.string().max(200).optional(),
});

const BranchesSchema = z.object({
  action: z.literal("branches"),
  runId: z.string().min(1),
});

const CompareBranchesSchema = z.object({
  action: z.literal("compare"),
  branchIdA: z.string().min(1),
  branchIdB: z.string().min(1),
});

const TimeTravelSchema = z.object({
  action: z.literal("time_travel"),
  runId: z.string().min(1),
  targetIndex: z.number().int().min(0),
});

const DecisionPointsSchema = z.object({
  action: z.literal("decisions"),
  runId: z.string().min(1),
});

const BranchFromDecisionSchema = z.object({
  action: z.literal("branch_decision"),
  decisionPointId: z.string().min(1),
  choice: z.string().min(1).max(500),
  label: z.string().max(200).optional(),
});

const SessionTreeSchema = z.object({
  action: z.literal("session_tree"),
  rootRunId: z.string().min(1),
});

const PostBodySchema = z.discriminatedUnion("action", [
  TimelineSchema,
  SnapshotSchema,
  ForkSchema,
  BranchesSchema,
  CompareBranchesSchema,
  TimeTravelSchema,
  DecisionPointsSchema,
  BranchFromDecisionSchema,
  SessionTreeSchema,
]);

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (runId) {
    const record = getRunRecord(runId);
    if (!record) {
      return Response.json({ error: "Run not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
    }
    const timeline = buildTimeline(runId);
    const branches = listBranchesForRun(runId);
    const decisions = getDecisionPoints(runId);
    return Response.json(
      { record, timeline, branches, decisions },
      { headers: API_RESPONSE_HEADERS }
    );
  }

  const runs = loadPersistedRuns();
  return Response.json({ runs }, { headers: API_RESPONSE_HEADERS });
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

  if (data.action === "timeline") {
    const timeline = buildTimeline(data.runId);
    const timelineView = buildTimelineView(data.runId);
    return Response.json({ timeline, timelineView }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "snapshot") {
    const snapshot = getSnapshot(data.runId, data.index);
    if (!snapshot) {
      return Response.json({ error: "Snapshot not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
    }
    return Response.json({ snapshot }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "fork") {
    const branch = forkRun(data.runId, data.snapshotIndex, data.label);
    if (!branch) {
      return Response.json({ error: "Failed to fork" }, { status: 400, headers: API_RESPONSE_HEADERS });
    }
    return Response.json({ branch }, { status: 201, headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "branches") {
    const branches = listBranchesForRun(data.runId);
    return Response.json({ branches }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "compare") {
    const comparison = compareBranches(data.branchIdA, data.branchIdB);
    if (!comparison) {
      return Response.json({ error: "Branch not found" }, { status: 404, headers: API_RESPONSE_HEADERS });
    }
    return Response.json({ comparison }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "time_travel") {
    const result = timeTravel(data.runId, data.targetIndex);
    if (!result) {
      return Response.json({ error: "Time travel failed" }, { status: 400, headers: API_RESPONSE_HEADERS });
    }
    return Response.json({ result }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "decisions") {
    const decisions = getDecisionPoints(data.runId);
    return Response.json({ decisions }, { headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "branch_decision") {
    const branch = branchFromDecision(data.decisionPointId, data.choice, data.label);
    if (!branch) {
      return Response.json(
        { error: "Failed to branch from decision" },
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }
    return Response.json({ branch }, { status: 201, headers: API_RESPONSE_HEADERS });
  }

  if (data.action === "session_tree") {
    const tree = getSessionTree(data.rootRunId);
    return Response.json({ tree }, { headers: API_RESPONSE_HEADERS });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: API_RESPONSE_HEADERS });
}
