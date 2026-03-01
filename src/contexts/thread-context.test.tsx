/**
 * Tests for in-memory thread state context.
 * @module contexts/thread-context.test
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThreadProvider, useThreads } from "./thread-context";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThreadProvider>{children}</ThreadProvider>
);

describe("thread context", () => {
  it("starts with one active default thread", () => {
    const { result } = renderHook(() => useThreads(), { wrapper });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0].title).toBe("New Chat");
    expect(result.current.activeThreadId).toBe(result.current.threads[0].id);
  });

  it("creates a thread and makes it active", () => {
    const { result } = renderHook(() => useThreads(), { wrapper });
    const initialActiveId = result.current.activeThreadId;

    act(() => {
      result.current.createThread();
    });

    expect(result.current.threads).toHaveLength(2);
    expect(result.current.activeThreadId).not.toBe(initialActiveId);
    expect(result.current.threads[0].id).toBe(result.current.activeThreadId);
  });

  it("selects an existing thread", () => {
    const { result } = renderHook(() => useThreads(), { wrapper });
    const firstThreadId = result.current.threads[0].id;

    act(() => {
      result.current.createThread();
    });

    act(() => {
      result.current.selectThread(firstThreadId);
    });

    expect(result.current.activeThreadId).toBe(firstThreadId);
  });

  it("updates a thread title", () => {
    const { result } = renderHook(() => useThreads(), { wrapper });
    const threadId = result.current.threads[0].id;

    act(() => {
      result.current.updateThreadTitle(threadId, "My Conversation");
    });

    expect(result.current.threads[0].title).toBe("My Conversation");
  });

  it("throws outside provider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useThreads())).toThrow(
      "useThreads must be used within a ThreadProvider",
    );

    consoleSpy.mockRestore();
  });
});
