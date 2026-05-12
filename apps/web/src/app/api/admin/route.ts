import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createRBACTeam,
  getRBACTeam,
  updateRBACTeam,
  addTeamMember,
  removeTeamMember,
  getTeamHierarchy,
  listRBACTeams,
  getQuota,
  setQuotaLimits,
  getAdminDashboard,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "../../../lib/api-headers";

const CreateTeamSchema = z.object({
  action: z.literal("create-team"),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  ownerId: z.string().max(200),
  parentId: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
});

const ManageMemberSchema = z.object({
  action: z.enum(["add-member", "remove-member"]),
  teamId: z.string().max(100),
  userId: z.string().max(200),
});

const SetQuotaSchema = z.object({
  action: z.literal("set-quota"),
  teamId: z.string().max(100),
  sessionsLimit: z.number().int().optional(),
  apiCallsLimit: z.number().int().optional(),
  llmTokensLimit: z.number().int().optional(),
});

const PostBodySchema = z.discriminatedUnion("action", [
  CreateTeamSchema,
  ManageMemberSchema.extend({ action: z.literal("add-member") }),
  ManageMemberSchema.extend({ action: z.literal("remove-member") }),
  SetQuotaSchema,
]);

/** GET /api/admin — retrieve team hierarchy, dashboard, or quota info. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "dashboard") {
      const orgId = searchParams.get("orgId") ?? "default";
      const dashboard = getAdminDashboard(orgId);
      return NextResponse.json({ dashboard }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "hierarchy") {
      const rootId = searchParams.get("rootId") ?? undefined;
      const hierarchy = getTeamHierarchy(rootId);
      return NextResponse.json({ hierarchy }, { headers: API_RESPONSE_HEADERS });
    }

    if (view === "quota") {
      const teamId = searchParams.get("teamId");
      if (!teamId) {
        return NextResponse.json(
          { error: "teamId required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const quota = getQuota(teamId);
      return NextResponse.json({ quota }, { headers: API_RESPONSE_HEADERS });
    }

    const teamId = searchParams.get("teamId");
    if (teamId) {
      const team = getRBACTeam(teamId);
      if (!team) {
        return NextResponse.json(
          { error: "Team not found" },
          { status: 404, headers: API_RESPONSE_HEADERS }
        );
      }
      return NextResponse.json({ team }, { headers: API_RESPONSE_HEADERS });
    }

    const teams = listRBACTeams();
    return NextResponse.json({ teams }, { headers: API_RESPONSE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  }
}

/** POST /api/admin — create teams, manage members, or set quotas. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = PostBodySchema.parse(body);

    switch (parsed.action) {
      case "create-team": {
        const team = createRBACTeam({
          name: parsed.name,
          slug: parsed.slug,
          ownerId: parsed.ownerId,
          parentId: parsed.parentId,
          description: parsed.description,
        });
        return NextResponse.json({ team }, { status: 201, headers: API_RESPONSE_HEADERS });
      }

      case "add-member": {
        addTeamMember(parsed.teamId, parsed.userId);
        const team = getRBACTeam(parsed.teamId);
        return NextResponse.json(
          { team, message: "Member added" },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "remove-member": {
        removeTeamMember(parsed.teamId, parsed.userId);
        const team = getRBACTeam(parsed.teamId);
        return NextResponse.json(
          { team, message: "Member removed" },
          { headers: API_RESPONSE_HEADERS }
        );
      }

      case "set-quota": {
        const quota = setQuotaLimits(parsed.teamId, {
          sessionsLimit: parsed.sessionsLimit,
          apiCallsLimit: parsed.apiCallsLimit,
          llmTokensLimit: parsed.llmTokensLimit,
        });
        return NextResponse.json(
          { quota, message: "Quota updated" },
          { headers: API_RESPONSE_HEADERS }
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400, headers: API_RESPONSE_HEADERS });
  }
}
