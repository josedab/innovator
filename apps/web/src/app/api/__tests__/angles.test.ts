import { describe, it, expect, vi, beforeEach } from "vitest";

const { customAngles, mockAngles } = vi.hoisted(() => ({
  mockAngles: [
    { id: "scamper", name: "SCAMPER", shortDescription: "Creative technique", icon: "🔄" },
    { id: "first-principles", name: "First Principles", shortDescription: "Decompose", icon: "🧱" },
  ],
  customAngles: [] as Array<{
    id: string;
    name: string;
    description: string;
    promptTemplate: string;
  }>,
}));

vi.mock("@innovator/core/innovation", () => ({
  ANGLES: mockAngles,
  loadCustomAngles: vi.fn(() => customAngles),
  addCustomAngle: vi.fn(
    (angle: { id: string; name: string; description: string; promptTemplate: string }) => {
      if (customAngles.some((a) => a.id === angle.id)) {
        throw new Error(`Custom angle with ID "${angle.id}" already exists`);
      }
      customAngles.push(angle);
    }
  ),
  removeCustomAngle: vi.fn((id: string) => {
    const idx = customAngles.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    customAngles.splice(idx, 1);
    return true;
  }),
}));

import { DELETE, GET, POST } from "../angles/route";

function makeRequest(method: string, body?: unknown, url = "http://localhost/api/angles"): Request {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

const VALID_ANGLE = {
  id: "test-angle",
  name: "Test Angle",
  description: "A test innovation angle",
  promptTemplate: "Generate ideas about {{subject}}",
};

describe("GET /api/angles", () => {
  beforeEach(() => {
    customAngles.length = 0;
    vi.clearAllMocks();
  });

  it("returns built-in angles", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.angles.length).toBeGreaterThanOrEqual(2);
    expect(data.angles[0].type).toBe("built-in");
  });

  it("includes custom angles", async () => {
    customAngles.push({ ...VALID_ANGLE });
    const res = await GET();
    const data = await res.json();
    const custom = data.angles.filter((a: Record<string, unknown>) => a.type === "custom");
    expect(custom).toHaveLength(1);
    expect(custom[0].id).toBe("test-angle");
  });
});

describe("POST /api/angles", () => {
  beforeEach(() => {
    customAngles.length = 0;
    vi.clearAllMocks();
  });

  it("creates a custom angle with valid body", async () => {
    const res = await POST(makeRequest("POST", VALID_ANGLE));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.angle.id).toBe("test-angle");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await POST(makeRequest("POST", { id: "x" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid angle");
  });

  it("returns 400 for invalid ID format", async () => {
    const res = await POST(makeRequest("POST", { ...VALID_ANGLE, id: "INVALID_ID" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate angle ID", async () => {
    customAngles.push({ ...VALID_ANGLE });
    const res = await POST(makeRequest("POST", VALID_ANGLE));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("already exists");
  });
});

describe("DELETE /api/angles", () => {
  beforeEach(() => {
    customAngles.splice(0, customAngles.length, { ...VALID_ANGLE });
    vi.clearAllMocks();
  });

  it("deletes an existing angle", async () => {
    const res = await DELETE(
      makeRequest("DELETE", undefined, "http://localhost/api/angles?id=test-angle")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 404 for nonexistent angle", async () => {
    const res = await DELETE(
      makeRequest("DELETE", undefined, "http://localhost/api/angles?id=nonexistent")
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when id parameter is missing", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing 'id'");
  });
});
