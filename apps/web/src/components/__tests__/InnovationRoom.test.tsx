/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import InnovationRoom from "../InnovationRoom";

const mockRoomData = {
  roomId: "room-1",
  code: "A3K9M2",
  name: "Q4 Brainstorm",
  participants: [
    { userId: "user-1", displayName: "Alice", status: "online" },
    { userId: "user-2", displayName: "Bob", status: "online" },
  ],
  ideas: [
    {
      id: "idea-1",
      content: "Use AI for code reviews",
      author: "user-2",
      votes: [],
      comments: [],
      score: 3,
      tags: ["ai", "devtools"],
      createdAt: "2024-01-01T00:00:00Z",
    },
  ],
  consensus: { reached: false, ratio: 0.4, topIdea: null },
};

function createRoomFetchMock(responses: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : {};
    const actionData = responses[body.action];
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          actionData !== undefined ? actionData : { data: null, error: "Unknown action" }
        ),
    });
  });
}

describe("InnovationRoom", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Lobby (no room joined)", () => {
    it("renders lobby with create and join sections", () => {
      vi.stubGlobal("fetch", createRoomFetchMock());
      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      expect(screen.getByText("🚀 Innovation Room")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("Create a new room")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("Join with room code")).toBeInstanceOf(HTMLElement);
    });

    it("creates a room on button click", async () => {
      vi.stubGlobal(
        "fetch",
        createRoomFetchMock({
          create_room: { data: mockRoomData },
        })
      );

      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      const nameInput = screen.getByPlaceholderText("Room name (e.g. Q4 Brainstorm)");
      fireEvent.change(nameInput, { target: { value: "My Room" } });
      fireEvent.click(screen.getByText("Create Room"));

      await waitFor(() => {
        expect(screen.getByText("Q4 Brainstorm")).toBeInstanceOf(HTMLElement);
      });
    });

    it("joins a room with code", async () => {
      vi.stubGlobal(
        "fetch",
        createRoomFetchMock({
          join_room: {
            data: {
              ...mockRoomData,
              participants: mockRoomData.participants,
              ideas: mockRoomData.ideas,
            },
          },
        })
      );

      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      const codeInput = screen.getByPlaceholderText("e.g. A3K9M2");
      fireEvent.change(codeInput, { target: { value: "A3K9M2" } });
      fireEvent.click(screen.getByText("Join"));

      await waitFor(() => {
        expect(screen.getByText("Q4 Brainstorm")).toBeInstanceOf(HTMLElement);
      });
    });

    it("shows error when room creation fails", async () => {
      vi.stubGlobal(
        "fetch",
        createRoomFetchMock({
          create_room: { error: "Rate limited" },
        })
      );

      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      const nameInput = screen.getByPlaceholderText("Room name (e.g. Q4 Brainstorm)");
      fireEvent.change(nameInput, { target: { value: "My Room" } });
      fireEvent.click(screen.getByText("Create Room"));

      await waitFor(() => {
        expect(screen.getByText("Rate limited")).toBeInstanceOf(HTMLElement);
      });
    });

    it("shows error when join fails due to network", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      const codeInput = screen.getByPlaceholderText("e.g. A3K9M2");
      fireEvent.change(codeInput, { target: { value: "BADCOD" } });
      fireEvent.click(screen.getByText("Join"));

      await waitFor(() => {
        expect(screen.getByText("Failed to join room")).toBeInstanceOf(HTMLElement);
      });
    });

    it("disables create button when room name is empty", () => {
      vi.stubGlobal("fetch", createRoomFetchMock());
      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      const createButton = screen.getByText("Create Room");
      expect(createButton).toHaveProperty("disabled", true);
    });
  });

  describe("Active Room", () => {
    async function renderActiveRoom(extraResponses: Record<string, unknown> = {}) {
      vi.stubGlobal(
        "fetch",
        createRoomFetchMock({
          create_room: { data: mockRoomData },
          presence: { data: { users: mockRoomData.participants } },
          consensus: {
            data: { reached: false, ratio: 0.4, topIdea: null, topIdeas: mockRoomData.ideas },
          },
          add_idea: {
            data: {
              id: "idea-new",
              content: "New idea",
              author: "user-1",
              votes: [],
              comments: [],
              score: 0,
              tags: [],
              createdAt: new Date().toISOString(),
            },
          },
          vote: { data: { success: true } },
          comment: {
            data: {
              id: "c1",
              userId: "user-1",
              text: "Great!",
              createdAt: new Date().toISOString(),
            },
          },
          synthesize: { data: { synthesis: "Combined insight from all ideas" } },
          ...extraResponses,
        })
      );

      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      const nameInput = screen.getByPlaceholderText("Room name (e.g. Q4 Brainstorm)");
      fireEvent.change(nameInput, { target: { value: "My Room" } });
      fireEvent.click(screen.getByText("Create Room"));

      await waitFor(() => {
        expect(screen.getByText("Q4 Brainstorm")).toBeInstanceOf(HTMLElement);
      });
    }

    it("shows room name and room code", async () => {
      await renderActiveRoom();
      expect(screen.getByText("Q4 Brainstorm")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("A3K9M2")).toBeInstanceOf(HTMLElement);
    });

    it("displays idea cards", async () => {
      await renderActiveRoom();

      await waitFor(() => {
        expect(screen.getByText("Use AI for code reviews")).toBeInstanceOf(HTMLElement);
      });
    });

    it("shows empty state when no ideas", async () => {
      vi.stubGlobal(
        "fetch",
        createRoomFetchMock({
          create_room: {
            data: { ...mockRoomData, ideas: [] },
          },
          presence: { data: { users: [] } },
          consensus: { data: { reached: false, ratio: 0, topIdea: null, topIdeas: [] } },
        })
      );

      render(<InnovationRoom userId="user-1" displayName="Alice" />);

      const nameInput = screen.getByPlaceholderText("Room name (e.g. Q4 Brainstorm)");
      fireEvent.change(nameInput, { target: { value: "Empty Room" } });
      fireEvent.click(screen.getByText("Create Room"));

      await waitFor(() => {
        expect(screen.getByText("No ideas yet. Be the first to share one!")).toBeInstanceOf(
          HTMLElement
        );
      });
    });

    it("adds a new idea", async () => {
      await renderActiveRoom();

      const textarea = screen.getByPlaceholderText("Share your idea…");
      fireEvent.change(textarea, { target: { value: "My new innovation" } });
      fireEvent.click(screen.getByText("+ Add Idea"));

      await waitFor(() => {
        expect(screen.getByText("New idea")).toBeInstanceOf(HTMLElement);
      });
    });
  });
});
