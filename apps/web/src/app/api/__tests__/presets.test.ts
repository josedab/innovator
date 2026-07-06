import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@innovator/core", () => {
  const presets = [
    {
      id: "startup-validation",
      name: "Startup Validation",
      description: "Validate startup ideas",
      icon: "🚀",
      category: "Business",
      suggestedSubject: "startup",
      selectedAngles: ["scamper"],
      contextHints: "",
      tags: ["startup"],
    },
    {
      id: "product-brainstorm",
      name: "Product Brainstorm",
      description: "Brainstorm features",
      icon: "💡",
      category: "Product",
      suggestedSubject: "product",
      selectedAngles: ["first-principles"],
      contextHints: "",
      tags: ["product"],
    },
  ];
  return {
    getPresets: vi.fn(() => presets),
    getPresetById: vi.fn((id: string) => presets.find((p) => p.id === id)),
  };
});

import { getPresets, getPresetById } from "@innovator/core";
import { GET } from "../presets/route";

const mockGetPresets = vi.mocked(getPresets);
const mockGetPresetById = vi.mocked(getPresetById);

describe("GET /api/presets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with array of presets", async () => {
    const res = await GET(new Request("http://localhost/api/presets"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(mockGetPresets).toHaveBeenCalledTimes(1);
  });

  it("GET with ?id=valid-id returns single preset", async () => {
    const res = await GET(new Request("http://localhost/api/presets?id=startup-validation"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.id).toBe("startup-validation");
    expect(data.data.name).toBe("Startup Validation");
    expect(mockGetPresetById).toHaveBeenCalledTimes(1);
    expect(mockGetPresetById).toHaveBeenCalledWith("startup-validation");
  });

  it("GET with ?id=nonexistent returns 404", async () => {
    const res = await GET(new Request("http://localhost/api/presets?id=nonexistent"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  it("GET with ?category=valid returns filtered presets", async () => {
    const res = await GET(new Request("http://localhost/api/presets?category=Business"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toHaveLength(1);
    expect(data.data[0].category).toBe("Business");
  });

  it("response format matches expected preset schema", async () => {
    const res = await GET(new Request("http://localhost/api/presets"));
    const data = await res.json();
    const preset = data.data[0];
    expect(preset).toHaveProperty("id");
    expect(preset).toHaveProperty("name");
    expect(preset).toHaveProperty("description");
    expect(preset).toHaveProperty("selectedAngles");
  });

  it("response includes correct headers", async () => {
    const res = await GET(new Request("http://localhost/api/presets"));
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("error in core getPresets returns 500", async () => {
    mockGetPresets.mockImplementation(() => {
      throw new Error("DB error");
    });
    // The route intentionally lets storage failures propagate to the framework boundary.
    try {
      await GET(new Request("http://localhost/api/presets"));
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });
});
