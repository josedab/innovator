import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import http from "node:http";

// Mock @innovator/core before importing server (webhook.ts imports core)
vi.mock("@innovator/core", () => ({
  parseSlashCommand: vi.fn().mockReturnValue({ command: "help", args: "" }),
  formatHelpForChat: vi.fn().mockReturnValue({ markdown: "# Help" }),
  formatInvestigationForChat: vi.fn().mockReturnValue({ markdown: "" }),
  formatAngleResultsForChat: vi.fn().mockReturnValue({ markdown: "" }),
  formatSynthesisForChat: vi.fn().mockReturnValue({ markdown: "" }),
  formatAnglesForChat: vi.fn().mockReturnValue({ markdown: "" }),
  formatPresetsForChat: vi.fn().mockReturnValue({ markdown: "" }),
  investigate: vi.fn().mockResolvedValue({ summary: "test" }),
  generateForAngle: vi.fn().mockResolvedValue({ angleId: "scamper", ideas: [] }),
  runAutoPipeline: vi.fn().mockResolvedValue(undefined),
  ANGLES: {},
  ANGLE_IDS: ["scamper"],
}));

import { CopilotExtensionServer } from "../server.js";

function computeValidSignature(payload: string, secret: string): string {
  const hmac = createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
  return `sha256=${hmac}`;
}

function makeRequest(
  server: CopilotExtensionServer,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = (server as unknown as { server: http.Server }).server?.address();
    const port = typeof addr === "object" && addr ? addr.port : 3200;

    const req = http.request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode!,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("CopilotExtensionServer", () => {
  let server: CopilotExtensionServer;
  const secret = "test-secret";

  beforeEach(async () => {
    server = new CopilotExtensionServer({
      port: 0, // random port
      webhookSecret: secret,
      skipVerification: false,
    });
    // Access internal server to get port - we need to start first
  });

  afterEach(async () => {
    await server.stop();
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      await server.start();
      const res = await makeRequest(server, "GET", "/health");
      expect(res.status).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe("ok");
      expect(json.version).toBeDefined();
    });
  });

  describe("OPTIONS (CORS)", () => {
    it("returns 204 with CORS headers", async () => {
      await server.start();
      const res = await makeRequest(server, "OPTIONS", "/");
      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });
  });

  describe("404 for unknown routes", () => {
    it("returns 404 for unknown GET path", async () => {
      await server.start();
      const res = await makeRequest(server, "GET", "/unknown");
      expect(res.status).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.error).toBe("Not found");
    });
  });

  describe("POST / with signature verification", () => {
    it("returns 401 for invalid signature", async () => {
      await server.start();
      const body = JSON.stringify({ messages: [{ role: "user", content: "/help" }] });
      const res = await makeRequest(server, "POST", "/", body, {
        "Content-Type": "application/json",
        "x-hub-signature-256":
          "sha256=invalidsignature0000000000000000000000000000000000000000000000",
      });
      expect(res.status).toBe(401);
    });

    it("returns 401 for missing signature", async () => {
      await server.start();
      const body = JSON.stringify({ messages: [{ role: "user", content: "/help" }] });
      const res = await makeRequest(server, "POST", "/", body, {
        "Content-Type": "application/json",
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid JSON", async () => {
      await server.start();
      const body = "not json at all";
      const sig = computeValidSignature(body, secret);
      const res = await makeRequest(server, "POST", "/", body, {
        "Content-Type": "application/json",
        "x-hub-signature-256": sig,
      });
      expect(res.status).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error).toBe("Invalid JSON");
    });
  });

  describe("POST / with valid payload", () => {
    it("streams SSE response for help command", async () => {
      // Skip verification for this test to focus on response format
      await server.stop();
      server = new CopilotExtensionServer({
        port: 0,
        webhookSecret: secret,
        skipVerification: true,
      });
      await server.start();

      const body = JSON.stringify({
        messages: [{ role: "user", content: "/help" }],
      });
      const res = await makeRequest(server, "POST", "/", body, {
        "Content-Type": "application/json",
      });

      expect(res.status).toBe(200);
      expect(res.body).toContain("data:");
      expect(res.body).toContain("[DONE]");
    });
  });

  describe("stop", () => {
    it("resolves when server is not started", async () => {
      const freshServer = new CopilotExtensionServer({ port: 0 });
      await expect(freshServer.stop()).resolves.toBeUndefined();
    });
  });

  describe("GET /manifest", () => {
    it("returns manifest JSON", async () => {
      await server.start();
      const res = await makeRequest(server, "GET", "/manifest");
      expect(res.status).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.name).toBe("Innovator");
      expect(json.commands).toBeDefined();
    });
  });
});
