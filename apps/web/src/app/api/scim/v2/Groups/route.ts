/**
 * @description SCIM 2.0 group provisioning for enterprise SSO.
 */
export const runtime = "nodejs";

import {
  scimCreateGroup,
  scimListGroups,
  scimGetGroup,
  scimUpdateGroup,
  validateScimToken,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";
import { logger } from "@/lib/logger";

const SCIM_HEADERS = {
  ...API_RESPONSE_HEADERS,
  "Content-Type": "application/scim+json",
};

function authenticateScim(request: Request): Response | null {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return Response.json(
      { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Unauthorized", status: 401 },
      { status: 401, headers: SCIM_HEADERS }
    );
  }
  if (!validateScimToken(auth.slice(7))) {
    return Response.json(
      { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Invalid token", status: 401 },
      { status: 401, headers: SCIM_HEADERS }
    );
  }
  return null;
}

const CreateGroupSchema = z.object({
  schemas: z.array(z.string()).optional(),
  displayName: z.string().max(200),
  members: z.array(z.object({
    value: z.string().max(200),
    display: z.string().max(200).optional(),
  })).max(500).optional(),
  externalId: z.string().max(200).optional(),
});

export async function GET(request: Request) {
  const authError = authenticateScim(request);
  if (authError) return authError;

  const groups = scimListGroups();

  return Response.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: groups.length,
    startIndex: 1,
    itemsPerPage: groups.length,
    Resources: groups,
  }, { headers: SCIM_HEADERS });
}

export async function POST(request: Request) {
  const authError = authenticateScim(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = CreateGroupSchema.parse(body);

    const group = scimCreateGroup({
      displayName: parsed.displayName,
      members: parsed.members,
      externalId: parsed.externalId,
    });

    logger.info("SCIM group created", { groupId: group.id, displayName: group.displayName });

    return Response.json(group, { status: 201, headers: SCIM_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Invalid group data", status: 400 },
        { status: 400, headers: SCIM_HEADERS }
      );
    }
    return Response.json(
      { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Internal error", status: 500 },
      { status: 500, headers: SCIM_HEADERS }
    );
  }
}
