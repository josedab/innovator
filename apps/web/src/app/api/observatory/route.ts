import { NextRequest } from "next/server";
import {
  getObservatoryStats,
  getCallTimeline,
  diffPromptCalls,
} from "@innovator/core";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") ?? "stats";

  try {
    switch (action) {
      case "stats": {
        const stats = getObservatoryStats();
        return new Response(JSON.stringify(stats), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "timeline": {
        const limit = parseInt(searchParams.get("limit") ?? "50", 10);
        const stage = searchParams.get("stage") ?? undefined;
        const model = searchParams.get("model") ?? undefined;
        const timeline = getCallTimeline({ limit, stage, model });
        return new Response(JSON.stringify({ calls: timeline }), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      case "diff": {
        const callIdA = searchParams.get("a");
        const callIdB = searchParams.get("b");
        if (!callIdA || !callIdB) {
          return new Response(JSON.stringify({ error: "Both 'a' and 'b' call IDs required" }), {
            status: 400,
            headers: API_RESPONSE_HEADERS,
          });
        }
        const diff = diffPromptCalls(callIdA, callIdB);
        if (!diff) {
          return new Response(JSON.stringify({ error: "One or both calls not found" }), {
            status: 404,
            headers: API_RESPONSE_HEADERS,
          });
        }
        return new Response(JSON.stringify(diff), {
          status: 200,
          headers: API_RESPONSE_HEADERS,
        });
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: API_RESPONSE_HEADERS,
        });
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
