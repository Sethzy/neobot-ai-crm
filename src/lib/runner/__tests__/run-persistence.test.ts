/**
 * Tests for run persistence — block storage wiring in finalizeRun.
 * @module lib/runner/__tests__/run-persistence
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedPart } from "@/lib/runner/message-utils";
import type { Json } from "@/types/database";

// --- Mocks for downstream modules ---
const mockCreateMessages = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/chat/messages", () => ({ createMessages: (...args: unknown[]) => mockCreateMessages(...args) }));

const mockCompleteRun = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/runner/run-lifecycle", () => ({ completeRun: (...args: unknown[]) => mockCompleteRun(...args) }));

const mockDrainAndContinue = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/runner/drain-and-continue", () => ({ drainAndContinue: (...args: unknown[]) => mockDrainAndContinue(...args) }));

const mockMaybeCompactThread = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/runner/compaction", () => ({
  maybeCompactThread: (...args: unknown[]) => mockMaybeCompactThread(...args),
  ARTIFACT_SIZE_THRESHOLD_BYTES: 5_000,
}));

const mockSaveToolcallBlock = vi.fn().mockResolvedValue(undefined);
const mockTruncateOversizedParts = vi.fn();
vi.mock("@/lib/runner/toolcall-artifacts", () => ({
  saveToolcallBlock: (...args: unknown[]) => mockSaveToolcallBlock(...args),
  truncateOversizedParts: (...args: unknown[]) => mockTruncateOversizedParts(...args),
}));

const mockCreateApprovalEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/approvals/queries", () => ({
  createApprovalEvent: (...args: unknown[]) => mockCreateApprovalEvent(...args),
}));

const mockCaptureServerEvents = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvents: (...args: unknown[]) => mockCaptureServerEvents(...args),
}));

const mockBuildAssistantPartsFromSteps = vi.fn();
const mockGetAssistantTextFromParts = vi.fn();
vi.mock("@/lib/runner/message-utils", () => ({
  buildAssistantPartsFromSteps: (...args: unknown[]) => mockBuildAssistantPartsFromSteps(...args),
  getAssistantTextFromParts: (...args: unknown[]) => mockGetAssistantTextFromParts(...args),
}));

// Import module under test after all mocks
const { extractApprovalRequests, finalizeRun } = await import("@/lib/runner/run-persistence");

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "thread-001";
const RUN_ID = "run-001";

function makeInput(overrides: Partial<Parameters<typeof finalizeRun>[0]> = {}) {
  return {
    supabase: {} as never,
    clientId: CLIENT_ID,
    threadId: THREAD_ID,
    runId: RUN_ID,
    modelId: "gemini-2.5-flash",
    steps: [],
    text: "",
    totalUsage: { inputTokens: 100, outputTokens: 50 },
    logLabel: "test",
    ...overrides,
  };
}

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("finalizeRun block storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveToolcallBlock.mockResolvedValue(undefined);
    mockCreateMessages.mockResolvedValue(undefined);
    mockCompleteRun.mockResolvedValue(undefined);
    mockDrainAndContinue.mockResolvedValue(undefined);
    mockMaybeCompactThread.mockResolvedValue(undefined);
    mockTruncateOversizedParts.mockReset();
    mockCreateApprovalEvent.mockResolvedValue({
      success: true,
      status: "created",
      event: {},
    });
    mockCaptureServerEvents.mockResolvedValue(undefined);
  });

  it("calls saveToolcallBlock for every tool part with output-available state", async () => {
    const parts: PersistedPart[] = [
      { type: "step-start" },
      { type: "tool-search_contacts", toolCallId: "call-1", state: "output-available", input: { query: "John" }, output: { success: true, contacts: [] } },
      { type: "text", text: "Found nothing." },
      { type: "tool-search_deals", toolCallId: "call-2", state: "output-available", input: { query: "Bishan" }, output: { success: true, deals: [{ id: 1 }] } },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("Found nothing.");

    await finalizeRun(makeInput());

    expect(mockSaveToolcallBlock).toHaveBeenCalledTimes(2);
    expect(mockSaveToolcallBlock).toHaveBeenCalledWith(
      expect.anything(),
      CLIENT_ID,
      "call-1",
      { query: "John" },
      { success: true, contacts: [] },
    );
    expect(mockSaveToolcallBlock).toHaveBeenCalledWith(
      expect.anything(),
      CLIENT_ID,
      "call-2",
      { query: "Bishan" },
      { success: true, deals: [{ id: 1 }] },
    );
  });

  it("skips non-tool parts and tool parts without output-available state", async () => {
    const parts: PersistedPart[] = [
      { type: "step-start" },
      { type: "text", text: "Hello" },
      { type: "tool-create_contact", toolCallId: "call-3", state: "input-available", input: { name: "Alice" } },
      { type: "reasoning", text: "thinking..." },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("Hello");

    await finalizeRun(makeInput());

    expect(mockSaveToolcallBlock).not.toHaveBeenCalled();
  });

  it("waits for block storage to finish before persisting the assistant message", async () => {
    const deferred = createDeferredPromise<void>();
    const parts: PersistedPart[] = [
      { type: "tool-search_contacts", toolCallId: "call-wait", state: "output-available", input: { q: "x" }, output: { success: true } },
      { type: "text", text: "Done" },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("Done");
    mockSaveToolcallBlock.mockImplementation(() => deferred.promise);

    const finalizePromise = finalizeRun(makeInput());
    await Promise.resolve();

    expect(mockCreateMessages).not.toHaveBeenCalled();

    deferred.resolve();
    await finalizePromise;

    expect(mockCreateMessages).toHaveBeenCalledTimes(1);
  });

  it("does not block persistence when saveToolcallBlock fails", async () => {
    const parts: PersistedPart[] = [
      { type: "tool-search_contacts", toolCallId: "call-fail", state: "output-available", input: { q: "x" }, output: { success: true } },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("");
    mockSaveToolcallBlock.mockRejectedValue(new Error("storage down"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Should not throw
    await finalizeRun(makeInput({ text: "Done" }));

    // Message persistence and run completion should still happen
    expect(mockCreateMessages).toHaveBeenCalled();
    expect(mockCompleteRun).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("includes tool-error parts for block storage with null result", async () => {
    const parts: PersistedPart[] = [
      { type: "tool-web_scrape", toolCallId: "call-err", state: "output-error", input: { url: "https://x.com" }, errorText: "timeout" },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("");

    await finalizeRun(makeInput({ text: "Error occurred" }));

    // output-error parts should NOT trigger block storage (no successful output)
    expect(mockSaveToolcallBlock).not.toHaveBeenCalled();
  });

  it("writes approval events for approval-requested tool parts before completing the run", async () => {
    const parts: PersistedPart[] = [
      { type: "step-start" },
      {
        type: "tool-delete_contact",
        toolCallId: "call-approval",
        state: "approval-requested",
        input: { contact_id: "contact-1" },
        approval: { id: "approval-1" },
      },
      { type: "text", text: "Waiting for approval." },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("Waiting for approval.");

    await finalizeRun(makeInput());

    expect(mockCreateApprovalEvent).toHaveBeenCalledWith(
      expect.anything(),
      {
        clientId: CLIENT_ID,
        threadId: THREAD_ID,
        runId: RUN_ID,
        toolName: "delete_contact",
        toolInput: { contact_id: "contact-1" },
        approvalId: "approval-1",
      },
    );
    expect(mockCreateMessages.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateApprovalEvent.mock.invocationCallOrder[0],
    );
    expect(mockCreateApprovalEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockCompleteRun.mock.invocationCallOrder[0],
    );
    expect(mockCaptureServerEvents).toHaveBeenCalledWith([
      {
        distinctId: CLIENT_ID,
        event: "approval_requested",
        properties: {
          approval_id: "approval-1",
          run_id: RUN_ID,
          thread_id: THREAD_ID,
          tool_name: "delete_contact",
        },
      },
    ]);
  });

  it("marks the run partial and skips draining when approval event persistence fails", async () => {
    const parts: PersistedPart[] = [
      { type: "step-start" },
      {
        type: "tool-delete_contact",
        toolCallId: "call-approval",
        state: "approval-requested",
        input: { contact_id: "contact-1" },
        approval: { id: "approval-1" },
      },
      { type: "text", text: "Waiting for approval." },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);
    mockTruncateOversizedParts.mockResolvedValue({ parts, recoveryPaths: [] });
    mockGetAssistantTextFromParts.mockReturnValue("Waiting for approval.");
    mockCreateApprovalEvent.mockResolvedValue({
      success: false,
      status: "error",
      error: "insert failed",
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finalizeRun(makeInput());

    expect(mockCompleteRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: RUN_ID,
        status: "partial",
      }),
    );
    expect(mockCaptureServerEvents).not.toHaveBeenCalled();
    expect(mockDrainAndContinue).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[test] approval event persistence failed:",
      "insert failed",
    );
    consoleSpy.mockRestore();
  });
});

describe("extractApprovalRequests", () => {
  it("returns approval-requested tool parts with approval id and tool name", () => {
    const parts: PersistedPart[] = [
      { type: "step-start" },
      { type: "text", text: "I can delete that contact." },
      {
        type: "tool-delete_contact",
        toolCallId: "tool-call-1",
        state: "approval-requested",
        input: { contact_id: "contact-1" },
        approval: { id: "approval-1" },
      },
      {
        type: "tool-search_contacts",
        toolCallId: "tool-call-2",
        state: "output-available",
        input: { query: "John" },
        output: { contacts: [] },
      },
    ];

    expect(extractApprovalRequests(parts)).toEqual([
      {
        approvalId: "approval-1",
        toolName: "delete_contact",
        toolInput: { contact_id: "contact-1" },
      },
    ]);
  });
});
