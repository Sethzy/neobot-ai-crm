/**
 * Tests stale run cleanup ordering before lock acquisition.
 * @module lib/runner/__tests__/stale-cleanup
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
  mockDrainAndContinue,
  mockCreateCrmTools,
  mockCreateStorageTools,
  mockCreateWebTools,
  mockCreateMessages,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockStepCountIs: vi.fn(() => vi.fn(() => true)),
  mockGateway: vi.fn(() => "mock-model"),
  mockAssembleContext: vi.fn(),
  mockCreateRun: vi.fn(),
  mockCompleteRun: vi.fn(),
  mockMarkStaleRunsFailed: vi.fn(),
  mockEnqueueMessage: vi.fn(),
  mockDrainAndContinue: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockCreateMessages: vi.fn(),
}));

vi.mock("ai", () => ({ streamText: mockStreamText, stepCountIs: mockStepCountIs }));
vi.mock("@/lib/chat/messages", () => ({
  createMessages: mockCreateMessages,
}));
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
vi.mock("@/lib/runner/drain-and-continue", () => ({
  drainAndContinue: mockDrainAndContinue,
}));
vi.mock("@/lib/runner/tools", () => ({
  createCrmTools: mockCreateCrmTools,
  createStorageTools: mockCreateStorageTools,
  createWebTools: mockCreateWebTools,
}));

import { runAgent } from "../run-agent";

describe("stale run cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkStaleRunsFailed.mockResolvedValue(0);
    mockCreateMessages.mockResolvedValue([]);
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

  it("calls stale cleanup before createRun", async () => {
    const order: string[] = [];
    mockMarkStaleRunsFailed.mockImplementation(async () => {
      order.push("markStale");
      return 0;
    });
    mockCreateRun.mockImplementation(async () => {
      order.push("createRun");
      return { created: true, runId: "run-1" };
    });

    await runAgent(
      {
        clientId: "ccc00000-0000-0000-0000-000000000000",
        threadId: "ttt00000-0000-0000-0000-000000000000",
        triggerType: "chat",
        input: "Hello",
      },
      "supabase" as never,
    );

    expect(order).toEqual(["markStale", "createRun"]);
    expect(mockMarkStaleRunsFailed).toHaveBeenCalledWith("supabase", {
      threadId: "ttt00000-0000-0000-0000-000000000000",
      staleMinutes: 15,
    });
  });
});
