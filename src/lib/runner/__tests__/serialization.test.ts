/**
 * Tests per-thread serialization behavior for runAgent.
 * @module lib/runner/__tests__/serialization
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStreamText,
  mockStepCountIs,
  mockGateway,
  mockAssembleContext,
  mockCreateRun,
  mockCompleteRun,
  mockMarkStaleRunsFailed,
  mockEnqueueMessage,
  mockCreateCrmTools,
  mockCreateStorageTools,
  mockCreateWebTools,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockAssembleContext: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockEnqueueMessage: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
}));

vi.mock("ai", () => ({ streamText: mockStreamText, stepCountIs: mockStepCountIs }));
vi.mock("@/lib/ai/gateway", () => ({
  gateway: mockGateway,
  TIER_1_MODEL: "google/gemini-3-flash",
}));
vi.mock("@/lib/runner/context", () => ({
  assembleContext: mockAssembleContext,
}));
vi.mock("@/lib/runner/run-lifecycle", () => ({
  createRun: mockCreateRun,
  completeRun: mockCompleteRun,
  markStaleRunsFailed: mockMarkStaleRunsFailed,
}));
vi.mock("@/lib/runner/thread-queue", () => ({
  enqueueMessage: mockEnqueueMessage,
}));
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createStorageTools: mockCreateStorageTools,
  createWebTools: mockCreateWebTools,
}));

import { runAgent } from "../run-agent";

const THREAD_A = "aaa00000-0000-0000-0000-000000000000";
const THREAD_B = "bbb00000-0000-0000-0000-000000000000";
const CLIENT = "ccc00000-0000-0000-0000-000000000000";

describe("per-thread serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateCrmTools.mockReturnValue({
      search_contacts: { description: "tool" },
    });
    mockCreateStorageTools.mockReturnValue({
      read_file: { description: "storage-tool" },
      write_file: { description: "storage-tool" },
    });
    mockCreateWebTools.mockReturnValue({
      web_search: { description: "web-search-tool" },
      web_scrape: { description: "web-scrape-tool" },
    });
    mockAssembleContext.mockResolvedValue({
      system: "prompt",
      messages: [{ role: "user", content: "test" }],
    });
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn(() => new Response("streamed")),
    });
  });

  it("starts streaming for first message on idle thread", async () => {
    mockCreateRun.mockResolvedValue({ created: true, runId: "run-a" });

    const result = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Hello" },
      "supabase" as never,
    );

    expect(result.status).toBe("streaming");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockEnqueueMessage).not.toHaveBeenCalled();
  });

  it("queues second message on busy thread", async () => {
    mockCreateRun.mockResolvedValue({ created: false });

    const result = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Follow up" },
      "supabase" as never,
    );

    expect(result).toEqual({ status: "queued" });
    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD_A,
      clientId: CLIENT,
      content: "Follow up",
      channel: "web",
    });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("allows different threads to run concurrently", async () => {
    mockCreateRun
      .mockResolvedValueOnce({ created: true, runId: "run-a" })
      .mockResolvedValueOnce({ created: true, runId: "run-b" });

    const resultA = await runAgent(
      { clientId: CLIENT, threadId: THREAD_A, triggerType: "chat", input: "Thread A" },
      "supabase" as never,
    );
    const resultB = await runAgent(
      { clientId: CLIENT, threadId: THREAD_B, triggerType: "chat", input: "Thread B" },
      "supabase" as never,
    );

    expect(resultA.status).toBe("streaming");
    expect(resultB.status).toBe("streaming");
    expect(mockStreamText).toHaveBeenCalledTimes(2);
  });
});
