/**
 * Tests for browser auth flow hook state transitions.
 * @module hooks/use-browser-auth.test
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

import { useBrowserAuth } from "./use-browser-auth";

describe("useBrowserAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("stores pending session data and exposes the liveUrl after connect", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: "session_123",
          liveUrl: "https://live.browser-use.com/session_123",
          browserUseProfileId: "profile_123",
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useBrowserAuth());

    await act(async () => {
      await result.current.connect("propnex");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("awaiting-login");
    });
    expect(result.current.state.liveUrl).toBe("https://live.browser-use.com/session_123");
    expect(sessionStorage.getItem("sunder-browser-auth:propnex")).toBe(
      JSON.stringify({
        sessionId: "session_123",
        browserUseProfileId: "profile_123",
      }),
    );
  });

  it("clears pending session data and marks the flow done after successful verify", async () => {
    sessionStorage.setItem(
      "sunder-browser-auth:propnex",
      JSON.stringify({
        sessionId: "session_123",
        browserUseProfileId: "profile_123",
      }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { result } = renderHook(() => useBrowserAuth());

    await act(async () => {
      await result.current.verify("propnex");
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("done");
    });
    expect(sessionStorage.getItem("sunder-browser-auth:propnex")).toBeNull();
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("fails fast when verify is called without a pending session", async () => {
    const { result } = renderHook(() => useBrowserAuth());

    await act(async () => {
      await result.current.verify("propnex");
    });

    expect(result.current.state.status).toBe("error");
    expect(mockToastError).toHaveBeenCalledWith(
      "No pending login session found. Connect the platform again.",
    );
  });
});
