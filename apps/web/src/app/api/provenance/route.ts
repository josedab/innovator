/**
 * @description Innovation Provenance Ledger — query, verify, and export
 * the tamper-evident audit trail of AI-assisted decisions.
 */
export const runtime = "nodejs";

import {
  verifyLedger,
  getLedgerSessionEntries,
  getLedgerActorEntries,
  getLedgerEntriesInRange,
  exportLedgerForActor,
  recordLedgerHumanDecision,
  ledgerToMarkdown,
} from "@innovator/core";
import { z } from "zod";
import { API_RESPONSE_HEADERS } from "@/lib/api-headers";

const RecordDecisionSchema = z.object({
  action: z.literal("record-decision"),
  sessionId: z.string().min(1).max(200),
  actor: z.string().min(1).max(200),
  type: z.enum(["approval", "rejection", "edit"]),
  subject: z.string().min(1).max(2000),
  reasoning: z.string().max(5000),
  alternatives: z.array(z.string().max(1000)).max(10).optional(),
});

const ExportSchema = z.object({
  action: z.literal("export"),
  actor: z.string().min(1).max(200),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") ?? "verify";

    if (action === "verify") {
      const result = verifyLedger();
      return Response.json(result, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (action === "session") {
      const sessionId = searchParams.get("sessionId");
      if (!sessionId) {
        return Response.json(
          { error: "sessionId parameter required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const entries = getLedgerSessionEntries(sessionId);
      return Response.json(
        { entries, count: entries.length },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    if (action === "actor") {
      const actor = searchParams.get("actor");
      if (!actor) {
        return Response.json(
          { error: "actor parameter required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const entries = getLedgerActorEntries(actor);
      return Response.json(
        { entries, count: entries.length },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    if (action === "range") {
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (!from || !to) {
        return Response.json(
          { error: "from and to parameters required" },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const entries = getLedgerEntriesInRange(from, to);
      return Response.json(
        { entries, count: entries.length },
        { status: 200, headers: API_RESPONSE_HEADERS }
      );
    }

    if (action === "markdown") {
      const sessionId = searchParams.get("sessionId") ?? "";
      const entries = sessionId ? getLedgerSessionEntries(sessionId) : [];
      return new Response(ledgerToMarkdown(entries), {
        status: 200,
        headers: { ...API_RESPONSE_HEADERS, "Content-Type": "text/markdown" },
      });
    }

    return Response.json(verifyLedger(), { status: 200, headers: API_RESPONSE_HEADERS });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Provenance query failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "export") {
      const parsed = ExportSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid export request", details: parsed.error.issues },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const exported = exportLedgerForActor(parsed.data.actor);
      return Response.json(exported, { status: 200, headers: API_RESPONSE_HEADERS });
    }

    if (body.action === "record-decision") {
      const parsed = RecordDecisionSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid decision record", details: parsed.error.issues },
          { status: 400, headers: API_RESPONSE_HEADERS }
        );
      }
      const { sessionId, actor, type, subject, reasoning, alternatives } = parsed.data;
      const entry = recordLedgerHumanDecision(
        sessionId,
        actor,
        type,
        subject,
        reasoning,
        alternatives
      );
      return Response.json(entry, { status: 201, headers: API_RESPONSE_HEADERS });
    }

    return Response.json(
      { error: "Unknown action. Use 'record-decision' or 'export'" },
      { status: 400, headers: API_RESPONSE_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Provenance operation failed" },
      { status: 500, headers: API_RESPONSE_HEADERS }
    );
  }
}
