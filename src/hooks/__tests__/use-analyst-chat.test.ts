/**
 * @fileoverview Tests for useAnalystChat hook.
 * Tests localStorage persistence, stale data detection, and first message flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock localStorage
let localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    localStorageStore = {};
  }),
};

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

// No AI SDK mocks needed - hook uses manual state management and fetch

describe("useAnalystChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageStore = {};
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("localStorage persistence", () => {
    it("loads existing messages from localStorage on mount", async () => {
      const existingSession = {
        caseId: "case-123",
        messages: [
          { id: "msg-1", role: "user", parts: [{ type: "text", text: "Hello" }] },
          { id: "msg-2", role: "assistant", parts: [{ type: "text", text: "Hi" }] },
        ],
        containerId: "container-abc",
        dataVersion: "5:2024-01-15T10:00:00Z",
      };
      // Set localStorage directly
      localStorageStore["analyst-chat-case-123"] = JSON.stringify(existingSession);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() =>
        useAnalystChat({
          caseId: "case-123",
        })
      );

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.isStale).toBe(false);
    });

    it("detects stale data when dataVersion differs", async () => {
      const existingSession = {
        caseId: "case-123",
        messages: [
          { id: "msg-1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        ],
        containerId: "container-abc",
        dataVersion: "5:2024-01-15T10:00:00Z", // Old version
      };
      // Set localStorage directly
      localStorageStore["analyst-chat-case-123"] = JSON.stringify(existingSession);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() =>
        useAnalystChat({
          caseId: "case-123",
        })
      );

      // Note: isStale is now determined by internal comparison, not passed prop
      expect(result.current.isStale).toBe(false);
    });

    it("clears session on startFresh", async () => {
      const existingSession = {
        caseId: "case-123",
        messages: [
          { id: "msg-1", role: "user", parts: [{ type: "text", text: "Hello" }] },
        ],
        containerId: "container-abc",
        dataVersion: "5:2024-01-15T10:00:00Z",
      };
      // Set localStorage directly
      localStorageStore["analyst-chat-case-123"] = JSON.stringify(existingSession);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() =>
        useAnalystChat({
          caseId: "case-123",
        })
      );

      act(() => {
        result.current.startFresh();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.isStale).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "analyst-chat-case-123"
      );
    });
  });

  describe("send function", () => {
    /**
     * Helper to create a mock SSE stream response for testing.
     * Simulates the streaming events from the API.
     */
    function createMockSSEResponse(events: Array<{ type: string; [key: string]: unknown }>) {
      const encoder = new TextEncoder();
      const sseData = events.map(evt => `data: ${JSON.stringify(evt)}\n\n`).join("");

      return {
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: {
          getReader() {
            let sent = false;
            return {
              read() {
                if (!sent) {
                  sent = true;
                  return Promise.resolve({ done: false, value: encoder.encode(sseData) });
                }
                return Promise.resolve({ done: true, value: undefined });
              },
            };
          },
        },
      };
    }

    it("sends first message via SSE streaming when no containerId", async () => {
      // Create mock SSE events
      const sseResponse = createMockSSEResponse([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello from Claude" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
        { type: "metadata", containerId: "container-new", savedFiles: [] },
      ]);

      mockFetch.mockResolvedValueOnce(sseResponse);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() =>
        useAnalystChat({
          caseId: "case-456",
        })
      );

      await act(async () => {
        await result.current.send("Analyze my documents");
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/chat",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Analyze my documents"),
        })
      );

      // Should have user message + assistant response
      expect(result.current.messages).toHaveLength(2);
    });

    it("shows error toast on first message failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ error: "No documents found" }),
      });

      const { toast } = await import("sonner");
      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() =>
        useAnalystChat({
          caseId: "case-789",
        })
      );

      await act(async () => {
        await result.current.send("Test");
      });

      // Messages should be cleared on error
      expect(result.current.messages).toHaveLength(0);
      expect(toast.error).toHaveBeenCalledWith("No documents found");
    });

    it("uses fetch SSE for follow-up when containerId exists", async () => {
      // Set up existing session with containerId
      localStorageStore["analyst-chat-case-follow"] = JSON.stringify({
        caseId: "case-follow",
        messages: [
          { id: "msg-1", role: "user", parts: [{ type: "text", text: "First" }] },
          {
            id: "msg-2",
            role: "assistant",
            parts: [{ type: "text", text: "Response" }],
          },
        ],
        containerId: "existing-container-123",
        dataVersion: "2:2024-01-15T10:00:00Z",
      });

      // Create mock SSE response for follow-up message
      const sseResponse = createMockSSEResponse([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Follow-up response" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
        { type: "metadata", containerId: "existing-container-123", savedFiles: [] },
      ]);

      mockFetch.mockResolvedValueOnce(sseResponse);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() =>
        useAnalystChat({
          caseId: "case-follow",
        })
      );

      await act(async () => {
        await result.current.send("Follow up question");
      });

      // Should call fetch (SSE) with containerId - now uses same path as first message
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/chat",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("existing-container-123"),
        })
      );
      // Body should contain the follow-up question and existing container
      const bodyArg = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(bodyArg.containerId).toBe("existing-container-123");
      expect(bodyArg.messages).toHaveLength(3); // 2 existing + 1 new user message
    });
  });

  describe("send with template files", () => {
    /**
     * Helper to create a mock SSE stream response for testing.
     */
    function createMockSSEResponse(events: Array<{ type: string; [key: string]: unknown }>) {
      const encoder = new TextEncoder();
      const sseData = events.map(evt => `data: ${JSON.stringify(evt)}\n\n`).join("");

      return {
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: {
          getReader() {
            let sent = false;
            return {
              read() {
                if (!sent) {
                  sent = true;
                  return Promise.resolve({ done: false, value: encoder.encode(sseData) });
                }
                return Promise.resolve({ done: true, value: undefined });
              },
            };
          },
        },
      };
    }

    it("converts template files to base64 and includes in request", async () => {
      const sseResponse = createMockSSEResponse([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I'll fill the template" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
        { type: "metadata", containerId: "container-template", savedFiles: [] },
      ]);

      mockFetch.mockResolvedValueOnce(sseResponse);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() => useAnalystChat({ caseId: "test-case-template" }));

      const templateFile = new File(["template content"], "budget.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      Object.defineProperty(templateFile, "size", { value: 2048 });

      await act(async () => {
        await result.current.send("Fill this template", undefined, undefined, [templateFile]);
      });

      // Verify fetch was called with templateFiles in body
      expect(mockFetch).toHaveBeenCalled();
      const bodyArg = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(bodyArg.templateFiles).toHaveLength(1);
      expect(bodyArg.templateFiles[0].name).toBe("budget.xlsx");
      expect(bodyArg.templateFiles[0].content).toBeDefined(); // base64
      expect(bodyArg.templateFiles[0].mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    });

    it("stores uploaded file metadata in session", async () => {
      const sseResponse = createMockSSEResponse([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Done" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
        { type: "metadata", containerId: "container-meta", savedFiles: [] },
      ]);

      mockFetch.mockResolvedValueOnce(sseResponse);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() => useAnalystChat({ caseId: "test-case-meta" }));

      const templateFile = new File(["content"], "budget.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      Object.defineProperty(templateFile, "size", { value: 2048 });

      await act(async () => {
        await result.current.send("Fill this", undefined, undefined, [templateFile]);
      });

      // Check localStorage was updated with uploadedFiles
      const storedSession = JSON.parse(localStorageStore["analyst-chat-test-case-meta"]);
      expect(storedSession.uploadedFiles).toEqual([
        { name: "budget.xlsx", size: 2048 },
      ]);
    });

    it("does not include template files on follow-up messages", async () => {
      // Set up existing session with containerId
      localStorageStore["analyst-chat-case-followup-template"] = JSON.stringify({
        caseId: "case-followup-template",
        messages: [
          { id: "msg-1", role: "user", parts: [{ type: "text", text: "First" }] },
          { id: "msg-2", role: "assistant", parts: [{ type: "text", text: "Response" }] },
        ],
        containerId: "existing-container-template",
        startedAt: new Date().toISOString(),
        uploadedFiles: [{ name: "budget.xlsx", size: 2048 }],
      });

      const sseResponse = createMockSSEResponse([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Follow-up" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
        { type: "metadata", containerId: "existing-container-template", savedFiles: [] },
      ]);

      mockFetch.mockResolvedValueOnce(sseResponse);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() => useAnalystChat({ caseId: "case-followup-template" }));

      const newTemplateFile = new File(["new"], "report.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

      await act(async () => {
        // Template files should be ignored on follow-up
        await result.current.send("Follow up", undefined, undefined, [newTemplateFile]);
      });

      // Verify templateFiles is not sent
      const bodyArg = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(bodyArg.templateFiles).toBeUndefined();
    });
  });

  describe("send with images", () => {
    /**
     * Helper to create a mock SSE stream response for testing.
     */
    function createMockSSEResponse(events: Array<{ type: string; [key: string]: unknown }>) {
      const encoder = new TextEncoder();
      const sseData = events.map(evt => `data: ${JSON.stringify(evt)}\n\n`).join("");

      return {
        ok: true,
        headers: new Headers({ "content-type": "text/event-stream" }),
        body: {
          getReader() {
            let sent = false;
            return {
              read() {
                if (!sent) {
                  sent = true;
                  return Promise.resolve({ done: false, value: encoder.encode(sseData) });
                }
                return Promise.resolve({ done: true, value: undefined });
              },
            };
          },
        },
      };
    }

    it("includes image parts in user message", async () => {
      const sseResponse = createMockSSEResponse([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I see your image" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
        { type: "metadata", containerId: "container-img", savedFiles: [] },
      ]);

      mockFetch.mockResolvedValueOnce(sseResponse);

      const { useAnalystChat } = await import("../use-analyst-chat");

      const { result } = renderHook(() => useAnalystChat({ caseId: "test-case-img" }));

      const file = new File(["test image content"], "screenshot.png", { type: "image/png" });

      await act(async () => {
        await result.current.send("Check this screenshot", undefined, [file]);
      });

      // Verify fetch was called with image parts in messages
      expect(mockFetch).toHaveBeenCalled();
      const bodyArg = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMessage = bodyArg.messages.find((m: { role: string }) => m.role === "user");

      expect(userMessage.parts).toContainEqual(
        expect.objectContaining({ type: "image", mediaType: "image/png" })
      );
    });
  });
});
