/** Tests for the chat-specific error boundary that catches render crashes. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatErrorBoundary } from "./chat-error-boundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("render crash");
  return <div>Chat content</div>;
}

describe("ChatErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error", () => {
    render(
      <ChatErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ChatErrorBoundary>,
    );
    expect(screen.getByText("Chat content")).toBeInTheDocument();
  });

  it("renders fallback UI on render crash", () => {
    render(
      <ChatErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ChatErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("recovers when Try Again is clicked", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function Toggler() {
      if (shouldThrow) throw new Error("render crash");
      return <div>Recovered</div>;
    }

    render(
      <ChatErrorBoundary>
        <Toggler />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("logs error to console with component stack", () => {
    render(
      <ChatErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ChatErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      "[ChatErrorBoundary] render crash:",
      expect.any(Error),
      expect.stringContaining("ThrowingChild"),
    );
  });
});
