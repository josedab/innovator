/**
 * @description Team workspace management API.
 */
export const runtime = "nodejs";

import {
  createSaasWorkspace,
  getSaasWorkspace,
  listTenantWorkspaces,
  addWorkspaceMember,
  removeWorkspaceMember,
} from "@innovator/core";
import { z } from "zod";
import { SECURITY_HEADERS } from "@/lib/api-headers";

const CreateSchema = z.object({
  action: z.literal("create"),
  tenantId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  ownerId: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const AddMemberSchema = z.object({
  action: z.literal("add-member"),
  workspaceId: z.string().min(1).max(200),
  userId: z.string().min(1).max(200),
  role: z.enum(["admin", "member", "viewer"]).optional(),
});

const RemoveMemberSchema = z.object({
  action: z.literal("remove-member"),
  workspaceId: z.string().min(1).max(200),
  userId: z.string().min(1).max(200),
});

const RequestSchema = z.discriminatedUnion("action", [
  CreateSchema,
  AddMemberSchema,
  RemoveMemberSchema,
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const data = parsed.data;

    if (data.action === "create") {
      const workspace = createSaasWorkspace({
        tenantId: data.tenantId,
        name: data.name,
        slug: data.slug,
        ownerId: data.ownerId,
        description: data.description,
      });
      return new Response(JSON.stringify(workspace), {
        status: 201,
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (data.action === "add-member") {
      const ws = addWorkspaceMember(data.workspaceId, data.userId, data.role);
      if (!ws) {
        return new Response(JSON.stringify({ error: "Workspace not found" }), {
          status: 404,
          headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(ws), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (data.action === "remove-member") {
      const removed = removeWorkspaceMember(data.workspaceId, data.userId);
      return new Response(JSON.stringify({ success: removed }), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("id");
    const tenantId = searchParams.get("tenantId");

    if (workspaceId) {
      const ws = getSaasWorkspace(workspaceId);
      if (!ws) {
        return new Response(JSON.stringify({ error: "Workspace not found" }), {
          status: 404,
          headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(ws), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (tenantId) {
      const list = listTenantWorkspaces(tenantId);
      return new Response(JSON.stringify({ workspaces: list }), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Provide id or tenantId" }), {
      status: 400,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  }
}
