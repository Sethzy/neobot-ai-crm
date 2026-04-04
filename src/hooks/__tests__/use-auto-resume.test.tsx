/**
 * Tests for auto-resume poll-based stream recovery.
 * @module hooks/__tests__/use-auto-resume
 */
import { render, waitFor } from "@testing-library/react";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoResume } from "../use-auto-resume";

const mockSetMessages = vi.fn();

/* ---------- Supabase mock ---------- */

let mockQueryResult: { data: Array<{ message_id: string; role: string; content: string | null; parts: null }> | null } = { data: null };

const mockOrder = vi.fn(() => Promise.resolve(mockQueryResult));
const mockEq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/chat/message-normalization", () => ({
  mapDbMessageToUiMessage: (row: { message_id: string; role: string }) => ({
    id: row.message_id,
    role: row.role,
    parts: [],
  }),
}));

/* ---------- helpers ---------- */

function TestHookComponent({
  autoResume,
  chatId,
  initialMessages,
}: {
  autoResume: boolean;
  chatId: string;
  initialMessages: UIMessage[];
}) {
  const { isWaitingForResponse } = useAutoResume({
    autoResume,
    chatId,
    initialMessages,
    setMessages: mockSetMessages,
  });
  return <div data-testid="waiting">{String(isWaitingForResponse)}</div>;
}

const userMsg: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Hello" }] };
const assistantMsg: UIMessage = { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hi there" }] };

describe("useAutoResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResult = { data: null };
  });

  it("does not poll when autoResume is false", () => {
    render(
      <TestHookComponent autoResume={false} chatId="thread-1" initialMessages={[userMsg]} />,
    );

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not poll when last message is assistant", () => {
    render(
      <TestHookComponent autoResume chatId="thread-1" initialMessages={[userMsg, assistantMsg]} />,
    );

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("calls setMessages when assistant response found on first poll", async () => {
    mockQueryResult = {
      data: [
        { message_id: "u1", role: "user", content: "Hello", parts: null },
        { message_id: "a1", role: "assistant", content: "Hi", parts: null },
      ],
    };

    render(
      <TestHookComponent autoResume chatId="thread-1" initialMessages={[userMsg]} />,
    );

    await waitFor(() => {
      expect(mockSetMessages).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "u1", role: "user" }),
          expect.objectContaining({ id: "a1", role: "assistant" }),
        ]),
      );
    });
  });

  it("sets isWaitingForResponse to true while polling", async () => {
    mockQueryResult = {
      data: [{ message_id: "u1", role: "user", content: "Hello", parts: null }],
    };

    const { getByTestId } = render(
      <TestHookComponent autoResume chatId="thread-1" initialMessages={[userMsg]} />,
    );

    await waitFor(() => {
      expect(getByTestId("waiting").textContent).toBe("true");
    });

    expect(mockSetMessages).not.toHaveBeenCalled();
  });
});
