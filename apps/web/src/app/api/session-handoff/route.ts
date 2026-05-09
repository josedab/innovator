export const runtime = "nodejs";

import {
  createBundle,
  importSessionBundle,
  getBundle,
  listBundles,
  deleteBundle,
  shareBundle,
  getShareInfo,
  CreateBundleSchema,
  ImportBundleSchema,
} from "@innovator/core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { validateJsonContentType } from "@/lib/validate-request";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const ExportAction = z.object({
  action: z.literal("export"),
  ...CreateBundleSchema.shape,
});

const ImportAction = z.object({
  action: z.literal("import"),
  bundle: ImportBundleSchema,
});

const GetAction = z.object({
  action: z.literal("get"),
  bundleId: z.string().min(1),
});

const ListAction = z.object({
  action: z.literal("list"),
});

const DeleteAction = z.object({
  action: z.literal("delete"),
  bundleId: z.string().min(1),
});

const ShareAction = z.object({
  action: z.literal("share"),
  bundleId: z.string().min(1),
  expiresInHours: z.number().min(1).max(720).default(72),
});

const RequestSchema = z.discriminatedUnion("action", [
  ExportAction,
  ImportAction,
  GetAction,
  ListAction,
  DeleteAction,
  ShareAction,
]);

/** POST /api/session-handoff — export, import, and share session bundles. */
export async function POST(request: Request) {
  const contentTypeError = validateJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: API_RESPONSE_HEADERS,
      });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: API_RESPONSE_HEADERS }
      );
    }

    switch (parsed.data.action) {
      case "export": {
        const { action: _, subject, ...data } = parsed.data;
        const bundle = createBundle(subject, data);
        return Response.json({ bundle }, { headers: API_RESPONSE_HEADERS });
      }
      case "import": {
        const bundle = importSessionBundle(parsed.data.bundle);
        return Response.json({ bundle, success: true }, { headers: API_RESPONSE_HEADERS });
      }
      case "get": {
        const bundle = getBundle(parsed.data.bundleId);
        if (!bundle) {
          return new Response(JSON.stringify({ error: "Bundle not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ bundle }, { headers: API_RESPONSE_HEADERS });
      }
      case "list": {
        const bundlesList = listBundles();
        return Response.json({ bundles: bundlesList }, { headers: API_RESPONSE_HEADERS });
      }
      case "delete": {
        const deleted = deleteBundle(parsed.data.bundleId);
        return Response.json({ success: deleted }, { headers: API_RESPONSE_HEADERS });
      }
      case "share": {
        const baseUrl = new URL(request.url).origin;
        const share = shareBundle(parsed.data.bundleId, baseUrl, parsed.data.expiresInHours);
        if (!share) {
          return new Response(JSON.stringify({ error: "Bundle not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return Response.json({ share }, { headers: API_RESPONSE_HEADERS });
      }
    }
  } catch (error) {
    logger.error("Session handoff error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/session-handoff",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}

/** GET /api/session-handoff — list all bundles. */
export async function GET() {
  try {
    const bundlesList = listBundles();
    return Response.json({ bundles: bundlesList }, { headers: API_RESPONSE_HEADERS });
  } catch (error) {
    logger.error("Session handoff GET error", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/session-handoff",
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: API_RESPONSE_HEADERS,
    });
  }
}
