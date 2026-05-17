/**
 * @module copilot-extension/server
 *
 * HTTP server for the Copilot Extension webhook endpoint.
 * Handles signature verification, CORS, health checks, and request routing.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { verifySignature } from "./verify.js";
import { handleWebhook, type WebhookPayload } from "./webhook.js";
import { EXTENSION_MANIFEST } from "./manifest.js";

/** Configuration options for the Copilot Extension HTTP server. */
export interface ServerConfig {
  /** Port to listen on (default: 3200 or COPILOT_EXT_PORT env). */
  port?: number;
  /** GitHub webhook secret for signature verification. */
  webhookSecret?: string;
  /** Default LLM model for generation requests. */
  model?: string;
  /** Skip signature verification (development only). */
  skipVerification?: boolean;
}

export class CopilotExtensionServer {
  private config: Required<ServerConfig>;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(config: ServerConfig = {}) {
    this.config = {
      port: config.port ?? parseInt(process.env.COPILOT_EXT_PORT ?? "3200", 10),
      webhookSecret: config.webhookSecret ?? process.env.COPILOT_WEBHOOK_SECRET ?? "",
      model: config.model ?? process.env.INNOVATOR_DEFAULT_MODEL ?? "gpt-4.1",
      skipVerification: config.skipVerification ?? process.env.NODE_ENV === "development",
    };
  }

  /** Start the HTTP server. */
  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal server error";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, () => {
        console.log(`🚀 Copilot Extension server running on port ${this.config.port}`);
        console.log(`   Webhook endpoint: POST http://localhost:${this.config.port}/`);
        console.log(`   Health check:     GET  http://localhost:${this.config.port}/health`);
        resolve();
      });
    });
  }

  /** Stop the HTTP server. */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    // Health check
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
      res.end(JSON.stringify({ status: "ok", version: EXTENSION_MANIFEST.version }));
      return;
    }

    // Manifest endpoint
    if (req.method === "GET" && req.url === "/manifest") {
      res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
      res.end(JSON.stringify(EXTENSION_MANIFEST));
      return;
    }

    // Webhook endpoint (POST /)
    if (req.method === "POST") {
      await this.handleWebhookRequest(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private async handleWebhookRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);

    // Verify webhook signature in non-development environments
    if (!this.config.skipVerification) {
      if (!this.config.webhookSecret) {
        console.warn(
          "[copilot-extension] COPILOT_WEBHOOK_SECRET is not set — webhook signature verification is disabled. Set it in production."
        );
      } else {
        const signature = req.headers["x-hub-signature-256"] as string | undefined;
        if (!signature || !verifySignature(body, signature, this.config.webhookSecret)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid signature" }));
          return;
        }
      }
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(body) as WebhookPayload;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Stream SSE response
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders(),
    });

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const result = await handleWebhook(payload, {
      model: this.config.model,
      signal: controller.signal,
    });

    for (const chunk of result.chunks) {
      res.write(chunk);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  }
}

// ---- Helpers ----

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Hub-Signature-256",
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 1024 * 1024; // 1 MB

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
