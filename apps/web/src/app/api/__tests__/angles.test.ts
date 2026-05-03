import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAngles = [
  { id: "scamper", name: "SCAMPER", shortDescription: "Creative technique", icon: "🔄" },
  { id: "first-principles", name: "First Principles", shortDescription: "Decompose", icon: "🧱" },
];

let customAngles: Array<{ id: string; name: string; description: string; promptTemplate: string }> =
  [];

vi.mock("@innovator/core", () => ({
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

// Inline route handlers to avoid Next.js resolution
import { z } from "zod";

const API_HEADERS = { "Content-Type": "application/json" };

const CreateAngleSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  promptTemplate: z.string().min(1).max(10000),
  icon: z.string().max(10).optional(),
  author: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

async function GET() {
  const { ANGLES, loadCustomAngles } = await import("@innovator/core");
  const builtIn = (ANGLES as Array<Record<string, unknown>>).map((a) => ({
    ...a,
    type: "built-in",
  }));
  const custom = (loadCustomAngles() as Array<Record<string, unknown>>).map((a) => ({
    ...a,
    type: "custom",
  }));
  return new Response(JSON.stringify({ angles: [...builtIn, ...custom] }), {
    headers: API_HEADERS,
  });
}

async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateAngleSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid angle definition", details: parsed.error.flatten() }),
        { status: 400, headers: API_HEADERS }
      );
    }
    const { addCustomAngle } = await import("@innovator/core");
    (addCustomAngle as (data: unknown) => void)(parsed.data);
    return new Response(JSON.stringify({ success: true, angle: parsed.data }), {
      status: 201,
      headers: API_HEADERS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create angle";
    return new Response(JSON.stringify({ error: message }), {
      status: 409,
      headers: API_HEADERS,
    });
  }
}

async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing 'id' parameter" }), {
        status: 400,
        headers: API_HEADERS,
      });
    }
    const { removeCustomAngle } = await import("@innovator/core");
    const removed = (removeCustomAngle as (id: string) => boolean)(id);
    if (!removed) {
      return new Response(JSON.stringify({ error: `Angle "${id}" not found` }), {
        status: 404,
        headers: API_HEADERS,
      });
    }
    return new Response(JSON.stringify({ success: true }), { headers: API_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to delete angle" }), {
      status: 500,
      headers: API_HEADERS,
    });
  }
}

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
    customAngles = [];
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
    customAngles = [];
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
    customAngles = [{ ...VALID_ANGLE }];
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
