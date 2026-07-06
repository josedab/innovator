import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("@innovator/core", () => ({
  registerEcosystem: vi.fn(),
  getEcosystem: vi.fn(),
  listEcosystems: vi.fn(),
  computeEcosystemHealth: vi.fn(),
  simulateStrategy: vi.fn(),
  compareStrategies: vi.fn(),
  EcosystemSnapshotSchema: z.object({
    id: z.string(),
    name: z.string(),
    actors: z.array(z.object({ id: z.string(), type: z.string(), influence: z.number() })),
    resources: z.array(z.object({ id: z.string(), type: z.string(), level: z.number() })),
  }),
  StrategySchema: z.object({
    id: z.string(),
    name: z.string(),
    actions: z.array(z.object({ type: z.string(), targetId: z.string(), intensity: z.number() })),
  }),
  runMonteCarloComparison: vi.fn(),
  twinMonteCarloToMarkdown: vi.fn(),
  TwinMonteCarloConfigSchema: z.object({
    iterations: z.number().optional(),
    timeHorizonWeeks: z.number().optional(),
    randomSeed: z.number().optional(),
  }),
}));

import {
  registerEcosystem,
  getEcosystem,
  listEcosystems,
  computeEcosystemHealth,
  compareStrategies,
  runMonteCarloComparison,
} from "@innovator/core";
import { GET, POST } from "../digital-twin/route";

const mockRegisterEcosystem = vi.mocked(registerEcosystem);
const mockGetEcosystem = vi.mocked(getEcosystem);
const mockListEcosystems = vi.mocked(listEcosystems);
const mockComputeEcosystemHealth = vi.mocked(computeEcosystemHealth);
const mockCompareStrategies = vi.mocked(compareStrategies);
const mockRunMonteCarloComparison = vi.mocked(runMonteCarloComparison as any);

// ---- Test data ----

const VALID_ECOSYSTEM = {
  id: "eco-1",
  name: "Test Ecosystem",
  actors: [{ id: "a1", type: "startup", influence: 0.8 }],
  resources: [{ id: "r1", type: "funding", level: 0.6 }],
};

const VALID_STRATEGY = {
  id: "s1",
  name: "Growth Strategy",
  actions: [{ type: "invest", targetId: "a1", intensity: 0.9 }],
};

function makeRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/digital-twin", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/digital-twin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("simulates strategies with LLM (default mode)", async () => {
    mockCompareStrategies.mockResolvedValue({
      rankings: [{ strategyId: "s1", score: 85 }],
    } as any);

    const res = await POST(
      makeRequest({ ecosystem: VALID_ECOSYSTEM, strategies: [VALID_STRATEGY] })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.rankings).toBeDefined();
    expect(mockRegisterEcosystem).toHaveBeenCalledWith(VALID_ECOSYSTEM);
    expect(mockCompareStrategies).toHaveBeenCalled();
  });

  it("runs Monte Carlo simulation", async () => {
    mockRunMonteCarloComparison.mockReturnValue({
      results: [{ strategyId: "s1", expectedValue: 42 }],
    });

    const res = await POST(
      makeRequest({
        ecosystem: VALID_ECOSYSTEM,
        strategies: [VALID_STRATEGY],
        mode: "monte-carlo",
        monteCarloConfig: { iterations: 500, timeHorizonWeeks: 26 },
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toBeDefined();
    expect(mockRunMonteCarloComparison).toHaveBeenCalledWith(VALID_ECOSYSTEM, [VALID_STRATEGY], {
      iterations: 500,
      timeHorizonWeeks: 26,
      randomSeed: undefined,
    });
  });

  it("compares multiple strategies", async () => {
    const strat2 = {
      id: "s2",
      name: "Conservative",
      actions: [{ type: "hold", targetId: "a1", intensity: 0.3 }],
    };
    mockCompareStrategies.mockResolvedValue({
      rankings: [
        { strategyId: "s1", score: 85 },
        { strategyId: "s2", score: 60 },
      ],
    } as any);

    const res = await POST(
      makeRequest({ ecosystem: VALID_ECOSYSTEM, strategies: [VALID_STRATEGY, strat2] })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.rankings).toHaveLength(2);
  });

  it("returns 400 for invalid simulation parameters", async () => {
    const res = await POST(makeRequest({ ecosystem: {}, strategies: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost/api/digital-twin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 500 when core function fails", async () => {
    mockCompareStrategies.mockRejectedValue(new Error("LLM timeout"));

    const res = await POST(
      makeRequest({ ecosystem: VALID_ECOSYSTEM, strategies: [VALID_STRATEGY] })
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("failed");
  });

  it("returns 500 when Monte Carlo fails", async () => {
    mockRunMonteCarloComparison.mockImplementation(() => {
      throw new Error("Numerical instability");
    });

    const res = await POST(
      makeRequest({
        ecosystem: VALID_ECOSYSTEM,
        strategies: [VALID_STRATEGY],
        mode: "monte-carlo",
      })
    );
    expect(res.status).toBe(500);
  });

  it("returns 415 for wrong content-type", async () => {
    const req = new Request("http://localhost/api/digital-twin", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ecosystem: VALID_ECOSYSTEM, strategies: [VALID_STRATEGY] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});

describe("GET /api/digital-twin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ecosystem health for valid id", async () => {
    mockGetEcosystem.mockReturnValue(VALID_ECOSYSTEM as any);
    mockComputeEcosystemHealth.mockReturnValue({ score: 0.85, status: "healthy" } as any);

    const req = new Request("http://localhost/api/digital-twin?id=eco-1");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ecosystem.id).toBe("eco-1");
    expect(data.health.score).toBe(0.85);
  });

  it("returns 404 for non-existent ecosystem", async () => {
    mockGetEcosystem.mockReturnValue(undefined as any);

    const req = new Request("http://localhost/api/digital-twin?id=missing");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("lists all ecosystems when no id provided", async () => {
    mockListEcosystems.mockReturnValue([{ id: "eco-1" }, { id: "eco-2" }] as any);

    const req = new Request("http://localhost/api/digital-twin");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(2);
  });

  it("returns 500 on GET error", async () => {
    mockGetEcosystem.mockImplementation(() => {
      throw new Error("DB failure");
    });

    const req = new Request("http://localhost/api/digital-twin?id=eco-1");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
