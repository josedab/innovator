import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebhookManager } from "../events/webhooks.js";
import { EventBus, getEventBus, resetEventBus } from "../events/emitter.js";
import {
  createAutomationRule,
  getAutomationRule,
  listAutomationRules,
  toggleAutomationRule,
  deleteAutomationRule,
  getAutomationLog,
  createHighScoreChain,
  createPipelineNotificationChain,
  clearAutomation,
} from "../events/automation.js";
import {
  SLACK_TEMPLATE,
  GITHUB_ISSUES_TEMPLATE,
  JIRA_TEMPLATE,
  EMAIL_TEMPLATE,
  getWebhookTemplate,
  listWebhookTemplates,
} from "../events/templates.js";
import type { PipelineEvent } from "../events/types.js";

// ---- EventBus tests ----

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("delivers events to typed listeners", async () => {
    const received: PipelineEvent[] = [];
    bus.on("pipeline.completed", (e) => {
      received.push(e);
    });

    await bus.emit("pipeline.completed", { result: "ok" }, "test");

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("pipeline.completed");
    expect(received[0].payload.result).toBe("ok");
  });

  it("supports wildcard listeners", async () => {
    const received: PipelineEvent[] = [];
    bus.on("*", (e) => {
      received.push(e);
    });

    await bus.emit("idea.created", { title: "New idea" });
    await bus.emit("pipeline.started", {});

    expect(received).toHaveLength(2);
  });

  it("once() fires only once", async () => {
    let count = 0;
    bus.once("idea.scored", () => { count++; });

    await bus.emit("idea.scored", { score: 90 });
    await bus.emit("idea.scored", { score: 95 });

    expect(count).toBe(1);
  });

  it("unsubscribe removes listener", async () => {
    let count = 0;
    const unsub = bus.on("pipeline.completed", () => { count++; });

    await bus.emit("pipeline.completed", {});
    unsub();
    await bus.emit("pipeline.completed", {});

    expect(count).toBe(1);
  });

  it("listenerCount returns correct counts", () => {
    bus.on("idea.created", () => {});
    bus.on("idea.created", () => {});
    bus.on("pipeline.completed", () => {});

    expect(bus.listenerCount("idea.created")).toBe(2);
    expect(bus.listenerCount("pipeline.completed")).toBe(1);
    expect(bus.listenerCount()).toBe(3);
  });

  it("clear removes all listeners", () => {
    bus.on("idea.created", () => {});
    bus.on("pipeline.completed", () => {});
    bus.clear();

    expect(bus.listenerCount()).toBe(0);
  });

  it("emit returns event with id and timestamp", async () => {
    const event = await bus.emit("session.saved", { sessionId: "s1" }, "Test Subject", "session-1");

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.type).toBe("session.saved");
    expect(event.subject).toBe("Test Subject");
    expect(event.sessionId).toBe("session-1");
  });

  it("handles async listener errors gracefully", async () => {
    bus.on("pipeline.completed", async () => {
      throw new Error("Listener failure");
    });
    bus.on("pipeline.completed", () => {});

    // Should not throw — uses Promise.allSettled
    const event = await bus.emit("pipeline.completed", {});
    expect(event).toBeDefined();
  });
});

describe("getEventBus / resetEventBus", () => {
  afterEach(() => resetEventBus());

  it("returns same singleton instance", () => {
    const bus1 = getEventBus();
    const bus2 = getEventBus();
    expect(bus1).toBe(bus2);
  });

  it("reset creates a new instance", () => {
    const bus1 = getEventBus();
    bus1.on("idea.created", () => {});
    resetEventBus();
    const bus2 = getEventBus();
    expect(bus2.listenerCount()).toBe(0);
  });
});

// ---- WebhookManager tests ----

describe("WebhookManager", () => {
  let manager: WebhookManager;
  const fetchSpy = vi.fn();

  beforeEach(() => {
    resetEventBus();
    manager = new WebhookManager();
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });

  afterEach(() => {
    manager.destroy();
    resetEventBus();
    vi.unstubAllGlobals();
  });

  describe("HMAC signature generation", () => {
    it("generates valid sha256 signature", () => {
      const payload = JSON.stringify({ test: true });
      const sig = manager.signPayload(payload, "test-secret-key-1234");

      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different signatures for different secrets", () => {
      const payload = JSON.stringify({ data: "same" });
      const sig1 = manager.signPayload(payload, "secret-one-abcdefgh");
      const sig2 = manager.signPayload(payload, "secret-two-abcdefgh");

      expect(sig1).not.toBe(sig2);
    });

    it("produces same signature for same payload+secret", () => {
      const payload = JSON.stringify({ data: "consistent" });
      const secret = "stable-secret-12345";
      const sig1 = manager.signPayload(payload, secret);
      const sig2 = manager.signPayload(payload, secret);

      expect(sig1).toBe(sig2);
    });
  });

  describe("webhook registration and delivery", () => {
    it("registers and delivers event successfully", async () => {
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.active).toBe(true);

      const event: PipelineEvent = {
        id: "evt-1",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: { result: "success" },
      };

      const delivery = await manager.deliverEvent(webhook.id, event);
      expect(delivery.status).toBe("success");
      expect(delivery.attempt).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Verify HMAC header was sent
      const callArgs = fetchSpy.mock.calls[0];
      expect(callArgs[1].headers["X-Innovator-Signature"]).toMatch(/^sha256=/);
    });

    it("returns failed for inactive webhook", async () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: false,
      });

      const event: PipelineEvent = {
        id: "evt-2",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: {},
      };

      const delivery = await manager.deliverEvent(webhook.id, event);
      expect(delivery.status).toBe("failed");
      expect(delivery.error).toContain("inactive");
    });
  });

  describe("retry with backoff on 5xx", () => {
    it("retries on server error and exhausts attempts", async () => {
      fetchSpy.mockResolvedValue(new Response("Server Error", { status: 500 }));

      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      const event: PipelineEvent = {
        id: "evt-3",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: {},
      };

      const delivery = await manager.deliverEvent(webhook.id, event);
      expect(delivery.status).toBe("failed");
      expect(fetchSpy).toHaveBeenCalledTimes(3); // MAX_RETRY_ATTEMPTS = 3
    });

    it("succeeds on retry after initial failure", async () => {
      fetchSpy
        .mockResolvedValueOnce(new Response("Error", { status: 503 }))
        .mockResolvedValueOnce(new Response("ok", { status: 200 }));

      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      const event: PipelineEvent = {
        id: "evt-4",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: {},
      };

      const delivery = await manager.deliverEvent(webhook.id, event);
      expect(delivery.status).toBe("success");
      expect(delivery.attempt).toBe(2);
    });
  });

  describe("dead letter queue", () => {
    it("adds to dead letter queue after all retries fail", async () => {
      fetchSpy.mockRejectedValue(new Error("Connection refused"));

      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      const event: PipelineEvent = {
        id: "evt-5",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: {},
      };

      await manager.deliverEvent(webhook.id, event);

      const deadLetters = manager.getDeadLetters();
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0].webhookId).toBe(webhook.id);
      expect(deadLetters[0].attempts).toBe(3);
      expect(deadLetters[0].lastError).toContain("Connection refused");
    });

    it("clears dead letter queue", async () => {
      fetchSpy.mockRejectedValue(new Error("fail"));

      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      await manager.deliverEvent(webhook.id, {
        id: "evt-6",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: {},
      });

      manager.clearDeadLetters();
      expect(manager.getDeadLetters()).toHaveLength(0);
    });
  });

  describe("delivery log", () => {
    it("tracks delivery history", async () => {
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      await manager.deliverEvent(webhook.id, {
        id: "evt-7",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: {},
      });

      const log = manager.getDeliveryLog(webhook.id);
      expect(log).toHaveLength(1);
      expect(log[0].status).toBe("success");
      expect(log[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("unregister", () => {
    it("removes webhook and its listeners", () => {
      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      expect(manager.getWebhook(webhook.id)).toBeDefined();
      manager.unregisterWebhook(webhook.id);
      expect(manager.getWebhook(webhook.id)).toBeUndefined();
    });
  });

  describe("timeout handling", () => {
    it("handles fetch timeout as failed delivery", async () => {
      fetchSpy.mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

      const webhook = manager.registerWebhook({
        url: "https://example.com/hook",
        events: ["pipeline.completed"],
        secret: "webhook-secret-1234567",
        active: true,
      });

      const delivery = await manager.deliverEvent(webhook.id, {
        id: "evt-timeout",
        type: "pipeline.completed",
        timestamp: new Date().toISOString(),
        payload: {},
      });

      expect(delivery.status).toBe("failed");
      expect(delivery.error).toContain("aborted");
    });
  });
});

// ---- Webhook Templates tests ----

describe("Webhook Templates", () => {
  const sampleEvent = {
    type: "pipeline.completed" as const,
    payload: { ideaTitle: "Test Idea", score: 90 } as Record<string, unknown>,
    subject: "Innovation Session",
  };

  it("Slack template renders with variables", () => {
    const body = SLACK_TEMPLATE.bodyTemplate(sampleEvent);
    expect(body.text).toContain("pipeline.completed");
    expect(body.blocks).toBeDefined();
    expect((body.blocks as any[])[0].text.text).toContain("Innovation Session");
  });

  it("GitHub Issues template renders with variables", () => {
    const body = GITHUB_ISSUES_TEMPLATE.bodyTemplate(sampleEvent);
    expect((body.title as string)).toContain("Test Idea");
    expect((body.body as string)).toContain("pipeline.completed");
    expect(body.labels).toContain("innovation");
  });

  it("Jira template renders with variables", () => {
    const body = JIRA_TEMPLATE.bodyTemplate(sampleEvent);
    expect((body.fields as any).summary).toContain("Test Idea");
    expect((body.fields as any).project.key).toBe("INNOV");
    expect((body.fields as any).issuetype.name).toBe("Task");
  });

  it("Email template renders with variables", () => {
    const body = EMAIL_TEMPLATE.bodyTemplate(sampleEvent);
    expect((body.subject as string)).toContain("pipeline.completed");
    expect((body.content as any[])[0].value).toContain("Innovation Session");
  });

  it("handles event without subject", () => {
    const noSubjectEvent = { type: "idea.scored" as const, payload: {} as Record<string, unknown> };
    const slackBody = SLACK_TEMPLATE.bodyTemplate(noSubjectEvent);
    expect(slackBody.text).toContain("idea.scored");
  });

  it("getWebhookTemplate finds by id", () => {
    expect(getWebhookTemplate("slack")).toBe(SLACK_TEMPLATE);
    expect(getWebhookTemplate("github-issues")).toBe(GITHUB_ISSUES_TEMPLATE);
    expect(getWebhookTemplate("nonexistent")).toBeUndefined();
  });

  it("listWebhookTemplates returns all templates", () => {
    const templates = listWebhookTemplates();
    expect(templates).toHaveLength(4);
    expect(templates.map((t) => t.id)).toEqual(["slack", "github-issues", "jira", "email"]);
  });
});

// ---- Automation tests ----

describe("Automation", () => {
  beforeEach(() => {
    resetEventBus();
    clearAutomation();
  });

  afterEach(() => {
    clearAutomation();
    resetEventBus();
  });

  describe("rule management", () => {
    it("creates and retrieves a rule", () => {
      const rule = createAutomationRule({
        name: "Test Rule",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [{ field: "payload.score", operator: "gte", value: 80 }],
        actions: [{ type: "log" }],
      });

      expect(rule.id).toMatch(/^rule-/);
      expect(rule.triggerCount).toBe(0);

      const retrieved = getAutomationRule(rule.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("Test Rule");
    });

    it("lists all rules", () => {
      createAutomationRule({
        name: "Rule 1",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });
      createAutomationRule({
        name: "Rule 2",
        enabled: true,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }],
      });

      expect(listAutomationRules()).toHaveLength(2);
    });

    it("toggles rule enabled state", () => {
      const rule = createAutomationRule({
        name: "Toggle Test",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });

      expect(toggleAutomationRule(rule.id, false)).toBe(true);
      expect(getAutomationRule(rule.id)!.enabled).toBe(false);
    });

    it("deletes a rule", () => {
      const rule = createAutomationRule({
        name: "Delete Me",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });

      expect(deleteAutomationRule(rule.id)).toBe(true);
      expect(getAutomationRule(rule.id)).toBeUndefined();
    });
  });

  describe("condition evaluation via event triggering", () => {
    it("fires actions when conditions are met", async () => {
      const rule = createAutomationRule({
        name: "Score Check",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [{ field: "payload.score", operator: "gte", value: 80 }],
        actions: [{ type: "log" }],
      });

      const bus = getEventBus();
      await bus.emit("idea.scored", { score: 90 });

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 50));

      const log = getAutomationLog(rule.id);
      expect(log.length).toBeGreaterThanOrEqual(1);
      expect(log[0].actionsExecuted[0].status).toBe("success");
    });

    it("does not fire when conditions are not met", async () => {
      const rule = createAutomationRule({
        name: "Score Check",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [{ field: "payload.score", operator: "gte", value: 80 }],
        actions: [{ type: "log" }],
      });

      const bus = getEventBus();
      await bus.emit("idea.scored", { score: 50 });
      await new Promise((r) => setTimeout(r, 50));

      expect(getAutomationLog(rule.id)).toHaveLength(0);
    });

    it("does not fire when rule is disabled", async () => {
      const rule = createAutomationRule({
        name: "Disabled Rule",
        enabled: false,
        triggerEvent: "pipeline.completed",
        conditions: [],
        actions: [{ type: "log" }],
      });

      const bus = getEventBus();
      await bus.emit("pipeline.completed", {});
      await new Promise((r) => setTimeout(r, 50));

      expect(getAutomationLog(rule.id)).toHaveLength(0);
    });

    it("evaluates complex conditions (multiple AND)", async () => {
      const rule = createAutomationRule({
        name: "Multi-Condition",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [
          { field: "payload.score", operator: "gte", value: 80 },
          { field: "payload.category", operator: "eq", value: "tech" },
        ],
        actions: [{ type: "log" }],
      });

      const bus = getEventBus();
      // Only score >= 80 but wrong category
      await bus.emit("idea.scored", { score: 90, category: "health" });
      await new Promise((r) => setTimeout(r, 50));
      expect(getAutomationLog(rule.id)).toHaveLength(0);

      // Both conditions met
      await bus.emit("idea.scored", { score: 90, category: "tech" });
      await new Promise((r) => setTimeout(r, 50));
      expect(getAutomationLog(rule.id)).toHaveLength(1);
    });

    it("evaluates 'contains' operator", async () => {
      const rule = createAutomationRule({
        name: "Contains Test",
        enabled: true,
        triggerEvent: "idea.created",
        conditions: [{ field: "subject", operator: "contains", value: "AI" }],
        actions: [{ type: "log" }],
      });

      const bus = getEventBus();
      await bus.emit("idea.created", {}, "AI-powered automation");
      await new Promise((r) => setTimeout(r, 50));

      expect(getAutomationLog(rule.id)).toHaveLength(1);
    });

    it("evaluates 'exists' operator", async () => {
      const rule = createAutomationRule({
        name: "Exists Test",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [{ field: "payload.score", operator: "exists" }],
        actions: [{ type: "log" }],
      });

      const bus = getEventBus();
      await bus.emit("idea.scored", { score: 42 });
      await new Promise((r) => setTimeout(r, 50));

      expect(getAutomationLog(rule.id)).toHaveLength(1);
    });
  });

  describe("preset chains", () => {
    it("createHighScoreChain creates rule with 3 actions", () => {
      const rule = createHighScoreChain(90, "my-org/my-repo");

      expect(rule.name).toContain("High Score");
      expect(rule.triggerEvent).toBe("idea.scored");
      expect(rule.conditions).toHaveLength(1);
      expect(rule.conditions[0].value).toBe(90);
      expect(rule.actions).toHaveLength(3);
      expect(rule.actions.map((a) => a.type)).toEqual([
        "generate-prd",
        "create-github-issue",
        "send-notification",
      ]);
    });

    it("createPipelineNotificationChain creates rule with 3 actions", () => {
      const rule = createPipelineNotificationChain("engineering");

      expect(rule.triggerEvent).toBe("pipeline.completed");
      expect(rule.conditions).toHaveLength(0);
      expect(rule.actions).toHaveLength(3);
      expect(rule.actions[0].config?.channel).toBe("engineering");
    });
  });

  describe("clearAutomation", () => {
    it("removes all rules and logs", () => {
      createAutomationRule({
        name: "Rule to clear",
        enabled: true,
        triggerEvent: "idea.scored",
        conditions: [],
        actions: [{ type: "log" }],
      });

      clearAutomation();

      expect(listAutomationRules()).toHaveLength(0);
      expect(getAutomationLog()).toHaveLength(0);
    });
  });
});
