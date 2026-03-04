/**
 * Tests for /chat draft surface behavior.
 * @module app/(dashboard)/chat/page.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ChatPage from "./page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("/chat page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("33333333-3333-4333-8333-333333333333");
  });

  it("renders the draft chat surface", () => {
    render(<ChatPage />);

    expect(screen.getByText(/what do you need done today/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/send a message/i)).toBeInTheDocument();
    expect(screen.getByText("Brief me on today's tasks")).toBeInTheDocument();
    expect(screen.getByText("Check my deal pipeline")).toBeInTheDocument();
  });

  it("does not redirect to an existing thread on mount", () => {
    render(<ChatPage />);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("creates a draft route handoff and navigates on composer submit", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "First draft message");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat/33333333-3333-4333-8333-333333333333?draft=1");
      expect(sessionStorage.getItem("initial_msg_33333333-3333-4333-8333-333333333333")).toBe("First draft message");
    });
  });

  it("resets isCreating state when navigation throws", async () => {
    mockPush.mockImplementationOnce(() => {
      throw new Error("Navigation failed");
    });

    const user = userEvent.setup();
    render(<ChatPage />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "Will fail");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/send a message/i)).not.toBeDisabled();
    });
  });

  it("submits suggestion text as the initial draft message", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: "Check my deal pipeline" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/chat/33333333-3333-4333-8333-333333333333?draft=1");
      expect(sessionStorage.getItem("initial_msg_33333333-3333-4333-8333-333333333333")).toBe("Check my deal pipeline");
    });
  });
});
