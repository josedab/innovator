import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus, getEventBus, resetEventBus } from "../emitter.js";
import type { PipelineEvent, EventType } from "../types.js";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe("on + emit", () => {
    it("calls listener when matching event is emitted", async () => {
      const handler = vi.fn();
      bus.on("pipeline.started", handler);

      await bus.emit("pipeline.started", { subject: "test" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({
        type: "pipeline.started",
        payload: { subject: "test" },
      });
    });

    it("does not call listener for non-matching events", async () => {
      const handler = vi.fn();
      bus.on("pipeline.started", handler);

      await bus.emit("pipeline.completed", { result: "ok" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("supports multiple listeners on the same event", async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.on("pipeline.started", h1);
      bus.on("pipeline.started", h2);

      await bus.emit("pipeline.started", {});

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("returns an unsubscribe function", async () => {
      const handler = vi.fn();
      const unsub = bus.on("pipeline.started", handler);

      unsub();
      await bus.emit("pipeline.started", {});

      expect(handler).not.toHaveBeenCalled();
    });

    it("emitting with no listeners does not throw", async () => {
      const event = await bus.emit("pipeline.started", { data: 1 });
      expect(event.type).toBe("pipeline.started");
    });

    it("returns a PipelineEvent with id, timestamp, and optional fields", async () => {
      const event = await bus.emit("investigation.started", { key: "val" }, "subject1", "session1");
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.subject).toBe("subject1");
      expect(event.sessionId).toBe("session1");
    });
  });

  describe("once", () => {
    it("calls listener only once then auto-removes", async () => {
      const handler = vi.fn();
      bus.once("pipeline.completed", handler);

      await bus.emit("pipeline.completed", {});
      await bus.emit("pipeline.completed", {});

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("returns an unsubscribe function that prevents the single call", async () => {
      const handler = vi.fn();
      const unsub = bus.once("pipeline.completed", handler);

      unsub();
      await bus.emit("pipeline.completed", {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("wildcard '*' listener", () => {
    it("receives all events", async () => {
      const handler = vi.fn();
      bus.on("*", handler);

      await bus.emit("pipeline.started", {});
      await bus.emit("pipeline.completed", {});
      await bus.emit("investigation.started", {});

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("receives events alongside type-specific listeners", async () => {
      const wildcard = vi.fn();
      const specific = vi.fn();
      bus.on("*", wildcard);
      bus.on("pipeline.started", specific);

      await bus.emit("pipeline.started", {});

      expect(wildcard).toHaveBeenCalledTimes(1);
      expect(specific).toHaveBeenCalledTimes(1);
    });
  });

  describe("listenerCount", () => {
    it("returns 0 for no listeners", () => {
      expect(bus.listenerCount("pipeline.started")).toBe(0);
    });

    it("returns count for a specific event type", () => {
      bus.on("pipeline.started", vi.fn());
      bus.on("pipeline.started", vi.fn());
      bus.on("pipeline.completed", vi.fn());

      expect(bus.listenerCount("pipeline.started")).toBe(2);
      expect(bus.listenerCount("pipeline.completed")).toBe(1);
    });

    it("returns total count when no event type specified", () => {
      bus.on("pipeline.started", vi.fn());
      bus.on("pipeline.completed", vi.fn());
      bus.on("*", vi.fn());

      expect(bus.listenerCount()).toBe(3);
    });
  });

  describe("clear", () => {
    it("removes all listeners", async () => {
      const handler = vi.fn();
      bus.on("pipeline.started", handler);
      bus.on("*", handler);

      bus.clear();

      await bus.emit("pipeline.started", {});
      expect(handler).not.toHaveBeenCalled();
      expect(bus.listenerCount()).toBe(0);
    });
  });

  describe("async listener handling", () => {
    it("handles async listeners via Promise.allSettled", async () => {
      const results: string[] = [];
      bus.on("pipeline.started", async () => {
        results.push("a");
      });
      bus.on("pipeline.started", async () => {
        throw new Error("fail");
      });
      bus.on("pipeline.started", async () => {
        results.push("c");
      });

      await bus.emit("pipeline.started", {});

      // All listeners run even if one throws
      expect(results).toEqual(["a", "c"]);
    });
  });
});

describe("global singleton", () => {
  beforeEach(() => {
    resetEventBus();
  });

  it("returns the same instance on repeated calls", () => {
    expect(getEventBus()).toBe(getEventBus());
  });

  it("returns a new instance after reset", () => {
    const a = getEventBus();
    resetEventBus();
    const b = getEventBus();
    expect(a).not.toBe(b);
  });

  it("clears listeners on reset", async () => {
    const handler = vi.fn();
    getEventBus().on("pipeline.started", handler);
    resetEventBus();

    await getEventBus().emit("pipeline.started", {});
    expect(handler).not.toHaveBeenCalled();
  });
});
