/**
 * Tests for memory query hooks.
 * @module lib/memory/__tests__/queries
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMemoryFile, useMemoryFiles, useUpdateMemoryFile } from "../queries";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("memory query hooks", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads memory file metadata list", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [{ name: "SOUL.md", path: "SOUL.md", updatedAt: null }],
      }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useMemoryFiles(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ name: "SOUL.md", path: "SOUL.md", updatedAt: null }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/memory/files");
  });

  it("fails memory file metadata query on non-OK response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "boom" }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useMemoryFiles(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Failed to load memory files.");
  });

  it("fails memory file metadata query on invalid response shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ bad: "shape" }] }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useMemoryFiles(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Failed to parse memory files response.");
  });

  it("does not fetch file content when path is null", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useMemoryFile(null), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches memory file content for selected path", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ path: "memory/preferences.md", content: "profile content" }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useMemoryFile("memory/preferences.md"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("profile content");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/memory/file?path=memory%2Fpreferences.md",
    );
  });

  it("fails memory file content query on non-OK response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "boom" }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useMemoryFile("memory/preferences.md"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("Failed to load memory file.");
  });

  it("saves memory file and invalidates file+list queries", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, path: "SOUL.md" }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setDataSpy = vi.spyOn(queryClient, "setQueryData");
    const { result } = renderHook(() => useUpdateMemoryFile(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        path: "SOUL.md",
        content: "updated soul",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/memory/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "SOUL.md", content: "updated soul" }),
    });
    // File content is set optimistically; only file list is invalidated for timestamps.
    expect(setDataSpy).toHaveBeenCalledWith(
      ["memory", "file", "SOUL.md"],
      "updated soul",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["memory", "files"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["memory", "file", "SOUL.md"] });
  });

  it("fails save mutation on non-OK response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "boom" }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useUpdateMemoryFile(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        path: "SOUL.md",
        content: "updated soul",
      }),
    ).rejects.toThrow("Failed to save memory file.");
  });
});
