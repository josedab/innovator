/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Investigation } from "@innovator/core/types";

const saveSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session-storage", () => ({
  saveSession,
}));

import { useInnovationFlow } from "../useInnovationFlow";

const investigation: Investigation = {
  summary: "Test",
  keyAspects: [],
  currentState: "Current",
  challenges: [],
  opportunities: [],
};

const angleResults = [{ angleId: "scamper", angleName: "SCAMPER", ideas: [] }];
const synthesis = { themes: [], topRecommendations: [], crossCuttingInsights: [] };

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(data),
  };
}

describe("useInnovationFlow", () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dispatch = vi.fn();
    fetchMock = vi.fn();
    saveSession.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("orchestrates investigation with the exact request, timeout, and actions", async () => {
    const timeoutSignal = new AbortController().signal;
    const combinedSignal = new AbortController().signal;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    const anySpy = vi.spyOn(AbortSignal, "any").mockReturnValue(combinedSignal);
    fetchMock.mockResolvedValueOnce(jsonResponse(investigation));

    const { result } = renderHook(() =>
      useInnovationFlow({ dispatch, subject: "", investigation: null })
    );

    await act(async () => {
      await result.current.handleInvestigate("test subject");
    });

    expect(dispatch.mock.calls).toEqual([
      [{ type: "START_INVESTIGATE", subject: "test subject" }],
      [{ type: "INVESTIGATION_SUCCESS", investigation }],
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "test subject" }),
      signal: combinedSignal,
    });
    expect(timeoutSpy).toHaveBeenCalledWith(60_000);
    expect(anySpy).toHaveBeenCalledWith([expect.any(AbortSignal), timeoutSignal]);
  });

  it("truncates non-OK investigation text and preserves fallback errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: vi.fn().mockResolvedValue("x".repeat(1100)),
    });
    const { result } = renderHook(() =>
      useInnovationFlow({ dispatch, subject: "", investigation: null })
    );

    await act(async () => {
      await result.current.handleInvestigate("test");
    });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "INVESTIGATION_ERROR",
      error: "x".repeat(1000),
    });

    fetchMock.mockRejectedValueOnce("not an error");
    await act(async () => {
      await result.current.handleInvestigate("test");
    });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "INVESTIGATION_ERROR",
      error: "Investigation failed",
    });
  });

  it("maps investigation response parse failures to the current error action", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error("Bad JSON")),
    });
    const { result } = renderHook(() =>
      useInnovationFlow({ dispatch, subject: "", investigation: null })
    );

    await act(async () => {
      await result.current.handleInvestigate("test");
    });

    expect(dispatch).toHaveBeenLastCalledWith({
      type: "INVESTIGATION_ERROR",
      error: "Invalid response from server",
    });
  });

  it("aborts the previous controller on restart and the active controller on reset", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useInnovationFlow({ dispatch, subject: "", investigation: null })
    );

    void result.current.handleInvestigate("first");
    const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    void result.current.handleInvestigate("second");
    const secondSignal = fetchMock.mock.calls[1]?.[1]?.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);

    act(() => {
      result.current.handleReset();
    });
    expect(secondSignal.aborted).toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "RESET" });
  });

  it("does nothing when innovation is requested without an investigation", async () => {
    const { result } = renderHook(() =>
      useInnovationFlow({ dispatch, subject: "test", investigation: null })
    );

    await act(async () => {
      await result.current.handleInnovate(["scamper"]);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("orchestrates innovation and saves only after successful parsing", async () => {
    let resolveJson!: (value: unknown) => void;
    const parsedResponse = new Promise((resolve) => {
      resolveJson = resolve;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockReturnValue(parsedResponse),
    });
    const { result } = renderHook(() =>
      useInnovationFlow({ dispatch, subject: "test subject", investigation })
    );

    let request!: Promise<void>;
    act(() => {
      request = result.current.handleInnovate(["scamper"]);
    });
    expect(saveSession).not.toHaveBeenCalled();

    await act(async () => {
      resolveJson({ angleResults, synthesis });
      await request;
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/innovate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "test subject",
          investigation,
          angles: ["scamper"],
          synthesize: true,
        }),
        signal: expect.any(AbortSignal),
      })
    );
    expect(dispatch.mock.calls).toEqual([
      [{ type: "START_INNOVATE", angles: ["scamper"] }],
      [{ type: "INNOVATION_SUCCESS", angleResults, synthesis }],
    ]);
    expect(saveSession).toHaveBeenCalledWith("test subject", angleResults, synthesis);
  });

  it("uses null synthesis and preserves innovation parse and fallback errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ angleResults }));
    const { result } = renderHook(() =>
      useInnovationFlow({ dispatch, subject: "test", investigation })
    );

    await act(async () => {
      await result.current.handleInnovate(["scamper"]);
    });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "INNOVATION_SUCCESS",
      angleResults,
      synthesis: null,
    });
    expect(saveSession).toHaveBeenLastCalledWith("test", angleResults, null);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error("Bad JSON")),
    });
    await act(async () => {
      await result.current.handleInnovate(["scamper"]);
    });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "INNOVATION_ERROR",
      error: "Invalid response from server",
    });

    fetchMock.mockRejectedValueOnce("not an error");
    await act(async () => {
      await result.current.handleInnovate(["scamper"]);
    });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "INNOVATION_ERROR",
      error: "Innovation generation failed",
    });
  });
});
