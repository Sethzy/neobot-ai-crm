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

describe("/chat page", () => {
  it("renders draft page with a generated UUID id", () => {
    render(<ChatPage />);

    const id = screen.getByTestId("draft-id").textContent ?? "";
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
