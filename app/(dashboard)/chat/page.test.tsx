/**
 * Tests for /chat draft route server rendering.
 * @module app/(dashboard)/chat/page.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ChatPage from "./page";

vi.mock("./chat-draft-page", () => ({
  ChatDraftPage: ({ id }: { id: string }) => <div data-testid="draft-id">{id}</div>,
}));

vi.mock("@/components/chat/data-stream-handler", () => ({
  DataStreamHandler: () => <div data-testid="data-stream-handler" />,
}));

vi.mock("@/lib/usage/message-quota-server", () => ({
  loadCurrentMessageQuota: vi.fn().mockResolvedValue(null),
}));

describe("/chat page", () => {
  it("renders draft page with a generated UUID id", async () => {
    render(await ChatPage());

    const id = screen.getByTestId("draft-id").textContent ?? "";
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(screen.getByTestId("data-stream-handler")).toBeInTheDocument();
  });
});
