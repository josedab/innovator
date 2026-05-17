import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { EventBus } from "../events/emitter.js";
import type { PipelineEvent, EventType } from "../events/types.js";

describe("EventBus filtering and buffering", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    bus.clear();
  });

  describe("onFiltered", () => {
    it("filters events by predicate", async () => {
      const received: PipelineEvent[] = [];

      bus.onFiltered(
        "idea.created",
        (e) => {
          received.push(e);
        },
        {
          filter: (e) => e.payload.score !== undefined && (e.payload.score as number) > 7,
        }
      );

      await bus.emit("idea.created", { score: 5 }, "subject1");
      await bus.emit("idea.created", { score: 9 }, "subject1");
      await bus.emit("idea.created", { score: 3 }, "subject1");

      expect(received).toHaveLength(1);
      expect(received[0].payload.score).toBe(9);
    });

    it("filters events by subject", async () => {
      const received: PipelineEvent[] = [];

      bus.onFiltered(
        "pipeline.started",
        (e) => {
          received.push(e);
        },
        {
          subject: "quantum computing",
        }
      );

      await bus.emit("pipeline.started", {}, "quantum computing");
      await bus.emit("pipeline.started", {}, "machine learning");

      expect(received).toHaveLength(1);
      expect(received[0].subject).toBe("quantum computing");
    });

    it("filters events by sessionId", async () => {
      const received: PipelineEvent[] = [];

      bus.onFiltered(
        "angle.completed",
        (e) => {
          received.push(e);
        },
        {
          sessionId: "session-123",
        }
      );

      await bus.emit("angle.completed", {}, "subject", "session-123");
      await bus.emit("angle.completed", {}, "subject", "session-456");

      expect(received).toHaveLength(1);
      expect(received[0].sessionId).toBe("session-123");
    });

    it("combines multiple filter criteria", async () => {
      const received: PipelineEvent[] = [];

      bus.onFiltered(
        "idea.scored",
        (e) => {
          received.push(e);
        },
        {
          subject: "AI",
          filter: (e) => (e.payload.score as number) > 5,
        }
      );

      await bus.emit("idea.scored", { score: 8 }, "AI"); // matches
      await bus.emit("idea.scored", { score: 3 }, "AI"); // score too low
      await bus.emit("idea.scored", { score: 8 }, "Other"); // wrong subject

      expect(received).toHaveLength(1);
    });

    it("unsubscribe removes filtered listener", async () => {
      const received: PipelineEvent[] = [];

      const unsub = bus.onFiltered(
        "pipeline.completed",
        (e) => {
          received.push(e);
        },
        {
          filter: () => true,
        }
      );

      await bus.emit("pipeline.completed", {});
      expect(received).toHaveLength(1);

      unsub();
      await bus.emit("pipeline.completed", {});
      expect(received).toHaveLength(1); // No new events after unsub
    });
  });

  describe("event buffering", () => {
    it("buffers events when enabled", async () => {
      const received: PipelineEvent[] = [];
      bus.on("pipeline.started", (e) => {
        received.push(e);
      });

      bus.enableBuffering();
      await bus.emit("pipeline.started", { step: 1 });
      await bus.emit("pipeline.started", { step: 2 });

      expect(received).toHaveLength(0); // Not delivered yet
      expect(bus.bufferedCount).toBe(2);

      const flushed = await bus.flush();
      expect(flushed).toBe(2);
      expect(received).toHaveLength(2);
      expect(bus.bufferedCount).toBe(0);
    });

    it("disableBuffering flushes remaining events", async () => {
      const received: PipelineEvent[] = [];
      bus.on("pipeline.completed", (e) => {
        received.push(e);
      });

      bus.enableBuffering();
      await bus.emit("pipeline.completed", {});

      await bus.disableBuffering();
      expect(received).toHaveLength(1);
      expect(bus.bufferedCount).toBe(0);
    });

    it("events delivered immediately when buffering disabled", async () => {
      const received: PipelineEvent[] = [];
      bus.on("investigation.started", (e) => {
        received.push(e);
      });

      await bus.emit("investigation.started", {});
      expect(received).toHaveLength(1);
    });

    it("auto-flush interval delivers events periodically", async () => {
      const received: PipelineEvent[] = [];
      bus.on("angle.started", (e) => {
        received.push(e);
      });

      bus.enableBuffering(100); // 100ms interval
      await bus.emit("angle.started", {});

      expect(received).toHaveLength(0);

      // Wait for the interval to fire naturally
      await new Promise((r) => setTimeout(r, 150));

      expect(received).toHaveLength(1);
      bus.clear(); // Clean up interval
    });

    it("clear stops buffering and clears buffer", () => {
      bus.enableBuffering(50);
      bus.emit("pipeline.started", {});

      bus.clear();
      expect(bus.bufferedCount).toBe(0);
    });
  });

  describe("backward compatibility", () => {
    it("on/once/emit work without filtering or buffering", async () => {
      const received: PipelineEvent[] = [];
      bus.on("investigation.completed", (e) => {
        received.push(e);
      });

      const event = await bus.emit("investigation.completed", { result: "done" });
      expect(received).toHaveLength(1);
      expect(event.type).toBe("investigation.completed");
    });

    it("wildcard listeners still work", async () => {
      const received: PipelineEvent[] = [];
      bus.on("*", (e) => {
        received.push(e);
      });

      await bus.emit("pipeline.started", {});
      await bus.emit("pipeline.completed", {});

      expect(received).toHaveLength(2);
    });

    it("once fires only once", async () => {
      const received: PipelineEvent[] = [];
      bus.once("pipeline.started", (e) => {
        received.push(e);
      });

      await bus.emit("pipeline.started", {});
      await bus.emit("pipeline.started", {});

      expect(received).toHaveLength(1);
    });
  });
});
