/**
 * Tests for /chat draft route server rendering.
 * @module app/(dashboard)/chat/page.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ChatPage from "./page";

const mockCookies = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => mockCookies(),
}));

vi.mock("./chat-draft-page", () => ({
  ChatDraftPage: ({
    id,
    initialChatModel,
  }: {
    id: string;
    initialChatModel: string;
  }) => (
    <div>
      <div data-testid="draft-id">{id}</div>
      <div data-testid="initial-chat-model">{initialChatModel}</div>
    </div>
  ),
}));

vi.mock("@/components/chat/data-stream-handler", () => ({
  DataStreamHandler: () => <div data-testid="data-stream-handler" />,
}));

vi.mock("@/lib/usage/message-quota-server", () => ({
  loadCurrentMessageQuota: vi.fn().mockResolvedValue(null),
}));

describe("/chat page", () => {
  it("renders draft page with a generated UUID id", async () => {
    mockCookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "minimax/minimax-m2.7" })),
    });

    render(await ChatPage());

    const id = screen.getByTestId("draft-id").textContent ?? "";
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(screen.getByTestId("initial-chat-model")).toHaveTextContent("minimax/minimax-m2.7");
    expect(screen.getByTestId("data-stream-handler")).toBeInTheDocument();
  });
});
