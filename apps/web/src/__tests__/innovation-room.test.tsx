/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InnovationRoom from "../components/InnovationRoom";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function defaultProps() {
  return { userId: "user-1", displayName: "Alice" };
}

describe("InnovationRoom", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  describe("Lobby view", () => {
    it("renders the lobby heading", () => {
      render(<InnovationRoom {...defaultProps()} />);
      expect(screen.getByText(/Innovation Room/)).toBeInstanceOf(HTMLElement);
    });

    it("renders create room input and button", () => {
      render(<InnovationRoom {...defaultProps()} />);
      expect(screen.getByPlaceholderText(/Room name/)).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("Create Room")).toBeInstanceOf(HTMLElement);
    });

    it("renders join room input and button", () => {
      render(<InnovationRoom {...defaultProps()} />);
      expect(screen.getByPlaceholderText(/A3K9M2/)).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("Join")).toBeInstanceOf(HTMLElement);
    });

    it("disables create button when room name is empty", () => {
      render(<InnovationRoom {...defaultProps()} />);
      const btn = screen.getByText("Create Room") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it("disables join button when code is empty", () => {
      render(<InnovationRoom {...defaultProps()} />);
      const btn = screen.getByText("Join") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it("creates a room on button click", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { roomId: "room-1", code: "ABC123", name: "My Room" },
          }),
      });
      render(<InnovationRoom {...defaultProps()} />);

      fireEvent.change(screen.getByPlaceholderText(/Room name/), {
        target: { value: "My Room" },
      });
      fireEvent.click(screen.getByText("Create Room"));

      await waitFor(() => {
        expect(screen.getByText("My Room")).toBeInstanceOf(HTMLElement);
      });
      expect(screen.getByText("ABC123")).toBeInstanceOf(HTMLElement);
    });

    it("shows error when room creation fails", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: "Room limit reached" }),
      });
      render(<InnovationRoom {...defaultProps()} />);

      fireEvent.change(screen.getByPlaceholderText(/Room name/), {
        target: { value: "Test" },
      });
      fireEvent.click(screen.getByText("Create Room"));

      await waitFor(() => {
        expect(screen.getByText("Room limit reached")).toBeInstanceOf(HTMLElement);
      });
    });

    it("joins a room with a valid code", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              roomId: "room-2",
              code: "XYZ789",
              name: "Joined Room",
              participants: [],
              ideas: [],
            },
          }),
      });
      render(<InnovationRoom {...defaultProps()} />);

      fireEvent.change(screen.getByPlaceholderText(/A3K9M2/), {
        target: { value: "XYZ789" },
      });
      fireEvent.click(screen.getByText("Join"));

      await waitFor(() => {
        expect(screen.getByText("Joined Room")).toBeInstanceOf(HTMLElement);
      });
    });

    it("shows error when join fails", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: "Room not found" }),
      });
      render(<InnovationRoom {...defaultProps()} />);

      fireEvent.change(screen.getByPlaceholderText(/A3K9M2/), {
        target: { value: "BADCODE" },
      });
      fireEvent.click(screen.getByText("Join"));

      await waitFor(() => {
        expect(screen.getByText("Room not found")).toBeInstanceOf(HTMLElement);
      });
    });
  });

  describe("Active room view", () => {
    async function renderActiveRoom(ideas: unknown[] = [], participants: unknown[] = []) {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              roomId: "room-1",
              code: "ABC123",
              name: "Active Room",
              participants,
              ideas,
              consensus: { reached: false, ratio: 0 },
            },
          }),
      });
      render(<InnovationRoom {...defaultProps()} />);

      fireEvent.change(screen.getByPlaceholderText(/Room name/), {
        target: { value: "Active Room" },
      });
      fireEvent.click(screen.getByText("Create Room"));

      await waitFor(() => {
        expect(screen.getByText("Active Room")).toBeInstanceOf(HTMLElement);
      });

      // Reset mock for subsequent calls
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    }

    it("shows room name and code in active room", async () => {
      await renderActiveRoom();
      expect(screen.getByText("Active Room")).toBeInstanceOf(HTMLElement);
      expect(screen.getByText("ABC123")).toBeInstanceOf(HTMLElement);
    });

    it("shows consensus progress bar", async () => {
      await renderActiveRoom();
      expect(screen.getByText("Consensus Progress")).toBeInstanceOf(HTMLElement);
    });

    it("shows empty ideas message when no ideas", async () => {
      await renderActiveRoom();
      expect(screen.getByText(/No ideas yet/)).toBeInstanceOf(HTMLElement);
    });

    it("renders add idea textarea", async () => {
      await renderActiveRoom();
      expect(screen.getByPlaceholderText(/Share your idea/)).toBeInstanceOf(HTMLElement);
    });

    it("renders tags input", async () => {
      await renderActiveRoom();
      expect(screen.getByPlaceholderText(/Tags/)).toBeInstanceOf(HTMLElement);
    });
  });
});
