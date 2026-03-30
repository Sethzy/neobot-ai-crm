/**
 * Tests queue drain + follow-up run behavior.
 * @module lib/runner/__tests__/drain-and-continue
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDrainQueue, mockRunAgent, mockEnqueueMessage } = vi.hoisted(() => ({
  mockDrainQueue: vi.fn(),
  mockRunAgent: vi.fn(),
  mockEnqueueMessage: vi.fn(),
}));

vi.mock("@/lib/runner/thread-queue", () => ({
  drainQueue: mockDrainQueue,
  enqueueMessage: mockEnqueueMessage,
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: mockRunAgent,
}));

import { drainAndContinue } from "../drain-and-continue";

const CLIENT = "ccc00000-0000-0000-0000-000000000000";
const THREAD = "ttt00000-0000-0000-0000-000000000000";

describe("drainAndContinue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no queued messages exist", async () => {
    mockDrainQueue.mockResolvedValue([]);

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockDrainQueue).toHaveBeenCalledWith("supabase", {
      threadId: THREAD,
      clientId: CLIENT,
    });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("starts follow-up run with single drained message", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "Only message",
        triggerType: "chat",
        selectedChatModel: "minimax/minimax-m2.7",
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Only message",
        selectedChatModel: "minimax/minimax-m2.7",
      },
      "supabase",
    );
  });

  it("batches multiple drained messages into one follow-up run input", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "First question",
        triggerType: "chat",
        selectedChatModel: "google/gemini-3-flash",
      },
      {
        text: "Second question",
        triggerType: "chat",
        selectedChatModel: "google/gemini-3-flash",
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Messages received while processing:\n1. First question\n2. Second question",
        selectedChatModel: "google/gemini-3-flash",
      },
      "supabase",
    );
  });

  it("stops batching when the selected chat model changes", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "Use Gemini for this first reply",
        triggerType: "chat",
        selectedChatModel: "google/gemini-3-flash",
      },
      {
        text: "Then switch to MiniMax",
        triggerType: "chat",
        selectedChatModel: "minimax/minimax-m2.7",
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Use Gemini for this first reply",
        selectedChatModel: "google/gemini-3-flash",
      },
      "supabase",
    );
    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD,
      clientId: CLIENT,
      content: "Then switch to MiniMax",
      triggerType: "chat",
      selectedChatModel: "minimax/minimax-m2.7",
    });
  });

  it("does not throw when follow-up run result is queued", async () => {
    mockDrainQueue.mockResolvedValue([{ text: "Follow up", triggerType: "chat" }]);
    mockRunAgent.mockResolvedValue({ status: "queued" });

    await expect(
      drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD }),
    ).resolves.not.toThrow();
  });

  it("replays queued cron messages as cron runs instead of chat runs", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "Process the most recent trigger event for this thread.",
        triggerType: "cron",
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "cron",
        input: "Process the most recent trigger event for this thread.",
      },
      "supabase",
    );
  });

  it("requeues remaining messages after taking the first non-chat item", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "Process the most recent trigger event for this thread.",
        triggerType: "cron",
      },
      {
        text: "Follow up on the leads from this morning",
        triggerType: "chat",
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD,
      clientId: CLIENT,
      content: "Follow up on the leads from this morning",
      triggerType: "chat",
    });
  });

  it("does not batch queued chat messages when the first item contains file parts", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "Review this screenshot",
        triggerType: "chat",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
      {
        text: "Then remind me to follow up",
        triggerType: "chat",
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "Review this screenshot",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
      "supabase",
    );
    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD,
      clientId: CLIENT,
      content: "Then remind me to follow up",
      triggerType: "chat",
      fileParts: undefined,
    });
  });

  it("stops batching before the first queued chat message that contains file parts", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "First question",
        triggerType: "chat",
      },
      {
        text: "Review this screenshot",
        triggerType: "chat",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockRunAgent).toHaveBeenCalledWith(
      {
        clientId: CLIENT,
        threadId: THREAD,
        triggerType: "chat",
        input: "First question",
      },
      "supabase",
    );
    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD,
      clientId: CLIENT,
      content: "Review this screenshot",
      triggerType: "chat",
      fileParts: [
        {
          type: "file",
          filename: "shot.png",
          mediaType: "image/png",
          url: "https://storage.example.com/chat-attachments/client-1/shot.png",
        },
      ],
    });
  });

  it("preserves queued channel metadata when replaying remaining messages", async () => {
    mockDrainQueue.mockResolvedValue([
      {
        text: "Review the attachment",
        triggerType: "chat",
        channel: "telegram",
        fileParts: [
          {
            type: "file",
            filename: "shot.png",
            mediaType: "image/png",
            url: "https://storage.example.com/chat-attachments/client-1/shot.png",
          },
        ],
      },
      {
        text: "Second Telegram follow up",
        triggerType: "chat",
        channel: "telegram",
      },
    ]);
    mockRunAgent.mockResolvedValue({ status: "streaming" });

    await drainAndContinue("supabase" as never, { clientId: CLIENT, threadId: THREAD });

    expect(mockEnqueueMessage).toHaveBeenCalledWith("supabase", {
      threadId: THREAD,
      clientId: CLIENT,
      content: "Second Telegram follow up",
      triggerType: "chat",
      channel: "telegram",
      fileParts: undefined,
    });
  });
});
