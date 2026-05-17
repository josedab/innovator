import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  tryFn,
  tryAsync,
  mapResult,
  mapError,
  flatMap,
  flatMapAsync,
  mapAsync,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  collectResults,
  partitionResults,
  isOk,
  isErr,
} from "../result/index.js";
import type { Result } from "../result/index.js";

describe("Result type", () => {
  describe("ok/err constructors", () => {
    it("ok creates a success result", () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      expect(r.value).toBe(42);
    });

    it("err creates a failure result", () => {
      const r = err(new Error("boom"));
      expect(r.ok).toBe(false);
      expect(r.error.message).toBe("boom");
    });

    it("works with non-Error error types", () => {
      const r = err("string error");
      expect(r.ok).toBe(false);
      expect(r.error).toBe("string error");
    });
  });

  describe("tryFn", () => {
    it("wraps successful calls", () => {
      const r = tryFn(() => 42);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(42);
    });

    it("wraps thrown errors", () => {
      const r = tryFn(() => {
        throw new Error("fail");
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toBe("fail");
    });

    it("wraps non-Error throws as Error", () => {
      const r = tryFn(() => {
        throw "string throw";
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toBe("string throw");
    });
  });

  describe("tryAsync", () => {
    it("wraps successful async calls", async () => {
      const r = await tryAsync(async () => 42);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(42);
    });

    it("wraps rejected promises", async () => {
      const r = await tryAsync(async () => {
        throw new Error("async fail");
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toBe("async fail");
    });
  });

  describe("mapResult", () => {
    it("transforms ok values", () => {
      const r = mapResult(ok(5), (x) => x * 2);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(10);
    });

    it("passes through errors", () => {
      const r = mapResult(err(new Error("e")), (x: number) => x * 2);
      expect(r.ok).toBe(false);
    });
  });

  describe("mapError", () => {
    it("transforms err values", () => {
      const r = mapError(err("bad"), (e) => `wrapped: ${e}`);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("wrapped: bad");
    });

    it("passes through ok values", () => {
      const r = mapError(ok(42), (e: string) => `wrapped: ${e}`);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(42);
    });
  });

  describe("flatMap", () => {
    it("chains successful results", () => {
      const r = flatMap(ok(5), (x) => ok(x * 2));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(10);
    });

    it("propagates errors from first result", () => {
      const r = flatMap(err("e1") as Result<number, string>, (x) => ok(x * 2));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("e1");
    });

    it("propagates errors from chained function", () => {
      const r = flatMap(ok(5), () => err("e2") as Result<number, string>);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("e2");
    });
  });

  describe("unwrap", () => {
    it("returns value for ok", () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it("throws error for err", () => {
      expect(() => unwrap(err(new Error("boom")))).toThrow("boom");
    });
  });

  describe("unwrapOr", () => {
    it("returns value for ok", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it("returns default for err", () => {
      expect(unwrapOr(err("e"), 0)).toBe(0);
    });
  });

  describe("unwrapOrElse", () => {
    it("returns value for ok", () => {
      expect(unwrapOrElse(ok(42), () => 0)).toBe(42);
    });

    it("computes default from error for err", () => {
      expect(unwrapOrElse(err("e"), (e) => e.length)).toBe(1);
    });
  });

  describe("collectResults", () => {
    it("collects all ok values", () => {
      const r = collectResults([ok(1), ok(2), ok(3)]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([1, 2, 3]);
    });

    it("returns first error", () => {
      const r = collectResults([ok(1), err("e1"), err("e2")]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("e1");
    });

    it("handles empty array", () => {
      const r = collectResults([]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    });
  });

  describe("partitionResults", () => {
    it("separates ok values and errors", () => {
      const { values, errors } = partitionResults([ok(1), err("e1"), ok(2), err("e2"), ok(3)]);
      expect(values).toEqual([1, 2, 3]);
      expect(errors).toEqual(["e1", "e2"]);
    });

    it("handles all ok", () => {
      const { values, errors } = partitionResults([ok(1), ok(2)]);
      expect(values).toEqual([1, 2]);
      expect(errors).toEqual([]);
    });

    it("handles all errors", () => {
      const { values, errors } = partitionResults([err("e1"), err("e2")]);
      expect(values).toEqual([]);
      expect(errors).toEqual(["e1", "e2"]);
    });
  });

  describe("isOk / isErr type guards", () => {
    it("isOk returns true for ok results", () => {
      const r = ok(42);
      expect(isOk(r)).toBe(true);
      if (isOk(r)) {
        expect(r.value).toBe(42);
      }
    });

    it("isOk returns false for err results", () => {
      const r = err(new Error("fail"));
      expect(isOk(r)).toBe(false);
    });

    it("isErr returns true for err results", () => {
      const r = err("bad");
      expect(isErr(r)).toBe(true);
      if (isErr(r)) {
        expect(r.error).toBe("bad");
      }
    });

    it("isErr returns false for ok results", () => {
      const r = ok(42);
      expect(isErr(r)).toBe(false);
    });

    it("type guards narrow correctly in conditional branches", () => {
      const r: Result<number, string> = Math.random() > 2 ? ok(1) : err("e");
      if (isOk(r)) {
        const _v: number = r.value;
        expect(typeof _v).toBe("number");
      } else {
        const _e: string = r.error;
        expect(typeof _e).toBe("string");
      }
    });
  });

  describe("flatMapAsync", () => {
    it("chains successful async results", async () => {
      const r = await flatMapAsync(ok(5), async (x) => ok(x * 2));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(10);
    });

    it("propagates errors from first result", async () => {
      const r = await flatMapAsync(err("e1") as Result<number, string>, async (x) => ok(x * 2));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("e1");
    });

    it("propagates errors from chained async function", async () => {
      const r = await flatMapAsync(ok(5), async () => err("e2") as Result<number, string>);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("e2");
    });
  });

  describe("mapAsync", () => {
    it("transforms ok values asynchronously", async () => {
      const r = await mapAsync(ok(5), async (x) => x * 3);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(15);
    });

    it("passes through errors unchanged", async () => {
      const r = await mapAsync(err(new Error("e")), async (x: number) => x * 2);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toBe("e");
    });
  });
});
