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
}));

const mockCreateApprovalEvent = vi.fn().mockResolvedValue(undefined);
const mockExpireApprovalEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/approvals/queries", () => ({
  createApprovalEvent: (...args: unknown[]) => mockCreateApprovalEvent(...args),
  expireApprovalEvent: (...args: unknown[]) => mockExpireApprovalEvent(...args),
}));

const mockCaptureServerEvents = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvents: (...args: unknown[]) => mockCaptureServerEvents(...args),
}));

const mockDeliverToExternalChannels = vi.fn().mockResolvedValue(undefined);
const mockHasExternalDeliverables = vi.fn().mockReturnValue(false);
vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: (...args: unknown[]) => mockDeliverToExternalChannels(...args),
  hasExternalDeliverables: (...args: unknown[]) => mockHasExternalDeliverables(...args),
}));

const mockBuildAssistantPartsFromSteps = vi.fn();
const mockGetAssistantTextFromParts = vi.fn();
vi.mock("@/lib/runner/message-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/runner/message-utils")>();
  return {
    ...actual,
    buildAssistantPartsFromSteps: (...args: unknown[]) => mockBuildAssistantPartsFromSteps(...args),
    getAssistantTextFromParts: (...args: unknown[]) => mockGetAssistantTextFromParts(...args),
  };
});

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

describe("finalizeRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMessages.mockResolvedValue(undefined);
    mockCompleteRun.mockResolvedValue(undefined);
    mockDrainAndContinue.mockResolvedValue(undefined);
    mockMaybeCompactThread.mockResolvedValue(undefined);

    mockCreateApprovalEvent.mockResolvedValue({
      success: true,
      status: "created",
      event: {},
    });
    mockExpireApprovalEvent.mockResolvedValue({
      success: true,
      status: "updated",
      event: {},
    });
    mockCaptureServerEvents.mockResolvedValue(undefined);
    mockDeliverToExternalChannels.mockResolvedValue(undefined);
    mockHasExternalDeliverables.mockReturnValue(false);
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
    expect(mockCreateApprovalEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateMessages.mock.invocationCallOrder[0],
    );
    expect(mockCreateMessages.mock.invocationCallOrder[0]).toBeLessThan(
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

  it("does not persist assistant message when approval event creation fails", async () => {
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

    mockGetAssistantTextFromParts.mockReturnValue("Waiting for approval.");
    mockCreateApprovalEvent.mockResolvedValue({
      success: false,
      status: "error",
      error: "insert failed",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await finalizeRun(makeInput());

    expect(mockCreateMessages).not.toHaveBeenCalled();
  });

  it("marks run partial when message persistence fails after approval events succeed", async () => {
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

    mockGetAssistantTextFromParts.mockReturnValue("Waiting for approval.");
    mockCreateApprovalEvent.mockResolvedValue({
      success: true,
      status: "created",
      event: {},
    });
    mockCreateMessages.mockRejectedValue(new Error("DB insert failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finalizeRun(makeInput());

    expect(mockCreateApprovalEvent).toHaveBeenCalled();
    expect(mockExpireApprovalEvent).toHaveBeenCalledWith(
      expect.anything(),
      {
        clientId: CLIENT_ID,
        approvalId: "approval-1",
      },
    );
    expect(mockCompleteRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: RUN_ID,
        status: "partial",
      }),
    );
    expect(mockDrainAndContinue).not.toHaveBeenCalled();
    expect(mockDeliverToExternalChannels).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("still marks run partial when orphaned approval cleanup fails", async () => {
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

    mockGetAssistantTextFromParts.mockReturnValue("Waiting for approval.");
    mockCreateApprovalEvent.mockResolvedValue({
      success: true,
      status: "created",
      event: {},
    });
    mockCreateMessages.mockRejectedValue(new Error("DB insert failed"));
    mockExpireApprovalEvent.mockResolvedValue({
      success: false,
      status: "error",
      error: "cleanup failed",
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await finalizeRun(makeInput());

    expect(mockExpireApprovalEvent).toHaveBeenCalled();
    expect(mockCompleteRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: RUN_ID,
        status: "partial",
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[test] approval cleanup failed after message persistence error:",
      "cleanup failed",
    );
    consoleSpy.mockRestore();
  });

  it("delivers to external channels after the run is completed and before draining queued work", async () => {
    const parts: PersistedPart[] = [
      { type: "text", text: "Telegram reply" },
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);

    mockGetAssistantTextFromParts.mockReturnValue("Telegram reply");
    mockHasExternalDeliverables.mockReturnValue(true);

    await finalizeRun(makeInput({ text: "Telegram reply" }));

    expect(mockDeliverToExternalChannels).toHaveBeenCalledWith(
      expect.anything(),
      THREAD_ID,
      CLIENT_ID,
      "Telegram reply",
      parts,
    );
    expect(mockCompleteRun.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeliverToExternalChannels.mock.invocationCallOrder[0],
    );
    expect(mockDeliverToExternalChannels.mock.invocationCallOrder[0]).toBeLessThan(
      mockDrainAndContinue.mock.invocationCallOrder[0],
    );
  });

  it("delivers question-only runs with no assistant prose when parts are externally deliverable", async () => {
    const parts: PersistedPart[] = [
      {
        type: "tool-ask_user_question",
        toolCallId: "tool-question-1",
        state: "output-available",
        output: {
          questions: [{ question: "Which contact?", options: ["John", "Mary"] }],
          status: "awaiting_response",
        },
      } as PersistedPart,
    ];

    mockBuildAssistantPartsFromSteps.mockReturnValue(parts);

    mockGetAssistantTextFromParts.mockReturnValue("");
    mockHasExternalDeliverables.mockReturnValue(true);

    await finalizeRun(makeInput({ text: "" }));

    expect(mockDeliverToExternalChannels).toHaveBeenCalledWith(
      expect.anything(),
      THREAD_ID,
      CLIENT_ID,
      "",
      parts,
    );
  });

  it("passes costUsd and cacheReadTokens to completeRun when model has pricing", async () => {
    mockBuildAssistantPartsFromSteps.mockReturnValue([{ type: "text", text: "hi" }]);
    mockGetAssistantTextFromParts.mockReturnValue("hi");

    await finalizeRun(
      makeInput({
        modelId: "minimax/minimax-m2.7",
        totalUsage: {
          inputTokens: 30_000,
          outputTokens: 200,
          inputTokenDetails: { cacheReadTokens: 25_000 },
        },
      }),
    );

    expect(mockCompleteRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "completed",
        costUsd: expect.closeTo(0.00324, 5),
        cacheReadTokens: 25_000,
      }),
    );
  });

  it("passes undefined costUsd for unknown models", async () => {
    mockBuildAssistantPartsFromSteps.mockReturnValue([{ type: "text", text: "hi" }]);
    mockGetAssistantTextFromParts.mockReturnValue("hi");

    await finalizeRun(
      makeInput({
        modelId: "unknown/model",
        totalUsage: { inputTokens: 100, outputTokens: 50 },
      }),
    );

    expect(mockCompleteRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        costUsd: undefined,
        cacheReadTokens: undefined,
      }),
    );
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
