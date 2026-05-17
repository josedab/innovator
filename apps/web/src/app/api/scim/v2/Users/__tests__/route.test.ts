import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @innovator/core SCIM functions
const mockScimListUsers = vi.fn();
const mockScimCreateUser = vi.fn();
const mockValidateScimToken = vi.fn();

vi.mock("@innovator/core", () => ({
  scimCreateUser: (...args: unknown[]) => mockScimCreateUser(...args),
  scimListUsers: (...args: unknown[]) => mockScimListUsers(...args),
  scimGetUser: vi.fn(),
  scimUpdateUser: vi.fn(),
  scimDeleteUser: vi.fn(),
  validateScimToken: (...args: unknown[]) => mockValidateScimToken(...args),
}));

vi.mock("@/lib/api-headers", () => ({
  API_RESPONSE_HEADERS: { "Content-Type": "application/json" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { GET, POST } from "../route.js";

function makeRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

describe("SCIM /api/scim/v2/Users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Authentication ----

  describe("authentication", () => {
    it("returns 401 when no Authorization header", async () => {
      const req = makeRequest("http://localhost/api/scim/v2/Users");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toBe("Unauthorized");
    });

    it("returns 401 for non-Bearer auth", async () => {
      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns 401 for invalid Bearer token", async () => {
      mockValidateScimToken.mockReturnValue(false);
      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toBe("Invalid token");
    });
  });

  // ---- GET /api/scim/v2/Users ----

  describe("GET", () => {
    it("returns paginated user list", async () => {
      mockValidateScimToken.mockReturnValue(true);
      mockScimListUsers.mockReturnValue({
        users: [{ id: "u1", userName: "alice" }],
        totalResults: 1,
      });

      const req = makeRequest("http://localhost/api/scim/v2/Users?startIndex=1&count=10", {
        headers: { Authorization: "Bearer valid-token" },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:ListResponse");
      expect(body.totalResults).toBe(1);
      expect(body.startIndex).toBe(1);
      expect(body.itemsPerPage).toBe(1);
      expect(body.Resources).toHaveLength(1);
    });

    it("passes filter parameter to scimListUsers", async () => {
      mockValidateScimToken.mockReturnValue(true);
      mockScimListUsers.mockReturnValue({ users: [], totalResults: 0 });

      const req = makeRequest(
        "http://localhost/api/scim/v2/Users?filter=userName%20eq%20%22alice%22",
        { headers: { Authorization: "Bearer valid-token" } }
      );
      await GET(req);

      expect(mockScimListUsers).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'userName eq "alice"' })
      );
    });

    it("defaults startIndex to 1 and count to 100", async () => {
      mockValidateScimToken.mockReturnValue(true);
      mockScimListUsers.mockReturnValue({ users: [], totalResults: 0 });

      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        headers: { Authorization: "Bearer valid-token" },
      });
      await GET(req);

      expect(mockScimListUsers).toHaveBeenCalledWith(
        expect.objectContaining({ startIndex: 1, count: 100 })
      );
    });
  });

  // ---- POST /api/scim/v2/Users ----

  describe("POST", () => {
    it("creates a user with valid SCIM schema", async () => {
      mockValidateScimToken.mockReturnValue(true);
      mockScimCreateUser.mockReturnValue({
        id: "u-new",
        userName: "bob",
        displayName: "Bob Smith",
      });

      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/scim+json",
        },
        body: JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: "bob",
          displayName: "Bob Smith",
          emails: [{ value: "bob@example.com", type: "work", primary: true }],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("u-new");
    });

    it("returns 400 for invalid SCIM user data", async () => {
      mockValidateScimToken.mockReturnValue(true);

      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/scim+json",
        },
        body: JSON.stringify({
          // Missing required userName and emails
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.detail).toBe("Invalid user data");
    });

    it("returns 400 for invalid email format", async () => {
      mockValidateScimToken.mockReturnValue(true);

      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/scim+json",
        },
        body: JSON.stringify({
          userName: "invalid",
          emails: [{ value: "not-an-email" }],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 401 for unauthenticated POST", async () => {
      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        method: "POST",
        body: JSON.stringify({ userName: "test" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("builds displayName from name parts when displayName not provided", async () => {
      mockValidateScimToken.mockReturnValue(true);
      mockScimCreateUser.mockReturnValue({ id: "u-name", userName: "jane" });

      const req = makeRequest("http://localhost/api/scim/v2/Users", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/scim+json",
        },
        body: JSON.stringify({
          userName: "jane",
          name: { givenName: "Jane", familyName: "Doe" },
          emails: [{ value: "jane@example.com" }],
        }),
      });

      await POST(req);

      expect(mockScimCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userName: "jane",
          displayName: "Jane Doe",
        })
      );
    });
  });
});
