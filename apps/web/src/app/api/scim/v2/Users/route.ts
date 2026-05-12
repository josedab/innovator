export const runtime = "nodejs";

import {
  scimCreateUser,
  scimListUsers,
  scimGetUser,
  scimUpdateUser,
  scimDeleteUser,
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

const CreateUserSchema = z.object({
  schemas: z.array(z.string()).optional(),
  userName: z.string().max(200),
  displayName: z.string().max(200).optional(),
  name: z.object({
    givenName: z.string().max(200).optional(),
    familyName: z.string().max(200).optional(),
  }).optional(),
  emails: z.array(z.object({
    value: z.string().email(),
    type: z.string().optional(),
    primary: z.boolean().optional(),
  })).min(1).max(10),
  active: z.boolean().optional(),
  externalId: z.string().max(200).optional(),
});

/** GET /api/scim/v2/Users — List users with SCIM pagination. */
export async function GET(request: Request) {
  const authError = authenticateScim(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const startIndex = parseInt(searchParams.get("startIndex") ?? "1", 10);
  const count = parseInt(searchParams.get("count") ?? "100", 10);
  const filter = searchParams.get("filter") ?? undefined;

  const { users, totalResults } = scimListUsers({ startIndex, count, filter });

  return Response.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults,
    startIndex,
    itemsPerPage: users.length,
    Resources: users,
  }, { headers: SCIM_HEADERS });
}

/** POST /api/scim/v2/Users — Create a SCIM user. */
export async function POST(request: Request) {
  const authError = authenticateScim(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = CreateUserSchema.parse(body);

    const displayName = parsed.displayName ??
      [parsed.name?.givenName, parsed.name?.familyName].filter(Boolean).join(" ") ??
      parsed.userName;

    const user = scimCreateUser({
      userName: parsed.userName,
      displayName,
      emails: parsed.emails.map((e) => ({
        value: e.value,
        type: (e.type as "work" | "home" | "other") ?? "work",
        primary: e.primary,
      })),
      externalId: parsed.externalId,
      active: parsed.active,
    });

    logger.info("SCIM user created", { userId: user.id, userName: user.userName });

    return Response.json(user, { status: 201, headers: SCIM_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Invalid user data", status: 400 },
        { status: 400, headers: SCIM_HEADERS }
      );
    }
    return Response.json(
      { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], detail: "Internal error", status: 500 },
      { status: 500, headers: SCIM_HEADERS }
    );
  }
}
