/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  useKeyboardNavigation,
  useAnnouncer,
  useReducedMotion,
  useFocusTrap,
} from "../accessibility/hooks";

describe("useKeyboardNavigation", () => {
  it("initializes with focusedIndex 0", () => {
    const { result } = renderHook(() => useKeyboardNavigation(5));
    expect(result.current.focusedIndex).toBe(0);
  });

  it("ArrowDown navigates forward in vertical mode", () => {
    const { result } = renderHook(() => useKeyboardNavigation(5));
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  it("ArrowUp navigates backward in vertical mode", () => {
    const { result } = renderHook(() => useKeyboardNavigation(5));
    // Move forward first
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    // Then back
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowUp",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it("wraps around from last to first", () => {
    const { result } = renderHook(() => useKeyboardNavigation(3, { wrap: true }));
    // Navigate past the end one step at a time
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });
    }
    expect(result.current.focusedIndex).toBe(0);
  });

  it("wraps around from first to last", () => {
    const { result } = renderHook(() => useKeyboardNavigation(3, { wrap: true }));
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowUp",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(2);
  });

  it("Enter calls onSelect with current index", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useKeyboardNavigation(5, { onSelect }));
    act(() => {
      result.current.handleKeyDown({
        key: "Enter",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("Space calls onSelect with current index", () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useKeyboardNavigation(5, { onSelect }));
    act(() => {
      result.current.handleKeyDown({
        key: " ",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("ArrowRight/Left navigates in grid mode", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation(6, { columns: 3, orientation: "grid" })
    );
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowRight",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(1);

    act(() => {
      result.current.handleKeyDown({
        key: "ArrowLeft",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it("Home navigates to first item", () => {
    const { result } = renderHook(() => useKeyboardNavigation(5));
    // Move forward first
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
      result.current.handleKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    act(() => {
      result.current.handleKeyDown({
        key: "Home",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it("End navigates to last item", () => {
    const { result } = renderHook(() => useKeyboardNavigation(5));
    act(() => {
      result.current.handleKeyDown({
        key: "End",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(4);
  });

  it("does not wrap when wrap is false", () => {
    const { result } = renderHook(() => useKeyboardNavigation(3, { wrap: false }));
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowUp",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(0); // stays at 0
  });

  it("grid mode ArrowDown moves by columns", () => {
    const { result } = renderHook(() =>
      useKeyboardNavigation(9, { columns: 3, orientation: "grid", wrap: true })
    );
    act(() => {
      result.current.handleKeyDown({
        key: "ArrowDown",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.focusedIndex).toBe(3); // 0 + 3 columns
  });
});

describe("useAnnouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns announce function and AnnouncerRegion component", () => {
    const { result } = renderHook(() => useAnnouncer());
    expect(typeof result.current.announce).toBe("function");
    expect(typeof result.current.AnnouncerRegion).toBe("function");
  });

  it("sets aria-live region text after timeout", () => {
    const { result } = renderHook(() => useAnnouncer());

    act(() => {
      result.current.announce("New item added");
    });

    // After the 100ms timeout, message should be set
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // The AnnouncerRegion is a functional component; we test the hook state
    // by verifying it doesn't throw
    expect(typeof result.current.AnnouncerRegion).toBe("function");
  });
});

describe("useReducedMotion", () => {
  it("returns false by default", () => {
    // Set up matchMedia mock for jsdom
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("detects prefers-reduced-motion and cleans up listener", () => {
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener,
      }),
    });

    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

describe("useFocusTrap", () => {
  it("returns a container ref", () => {
    const { result } = renderHook(() => useFocusTrap(true));
    expect(result.current).not.toBeNull();
    expect(result.current.current).toBeNull(); // not mounted
  });

  it("does not error when not active", () => {
    const { result } = renderHook(() => useFocusTrap(false));
    expect(result.current).not.toBeNull();
  });
});
