/**
 * Tests for /chat draft surface behavior.
 * @module app/(dashboard)/chat/page.test
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import ChatPage from "./page";

const mockPush = vi.fn();
const mockCreateThread = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    createThread: (...args: unknown[]) => mockCreateThread(...args),
  }),
}));

describe("/chat page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockCreateThread.mockResolvedValue("thread-123");
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
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("creates a thread, stores first message handoff, and navigates on composer submit", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.type(screen.getByPlaceholderText(/send a message/i), "First draft message");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mockCreateThread).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/chat/thread-123");
      expect(sessionStorage.getItem("initial_msg_thread-123")).toBe("First draft message");
    });
  });

  it("submits suggestion text as the initial draft message", async () => {
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: "Check my deal pipeline" }));

    await waitFor(() => {
      expect(mockCreateThread).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/chat/thread-123");
      expect(sessionStorage.getItem("initial_msg_thread-123")).toBe("Check my deal pipeline");
    });
  });

  it("unlocks retry when thread creation fails", async () => {
    const user = userEvent.setup();
    mockCreateThread
      .mockRejectedValueOnce(new Error("create failed"))
      .mockResolvedValueOnce("thread-456");

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: "Brief me on today's tasks" }));
    await user.click(screen.getByRole("button", { name: "Brief me on today's tasks" }));

    await waitFor(() => {
      expect(mockCreateThread).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith("/chat/thread-456");
    });
    expect(toast.error).toHaveBeenCalledWith("Failed to create chat.");
  });
});
