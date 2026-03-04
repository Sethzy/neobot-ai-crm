/**
 * Tests for chat composer input behavior.
 * @module components/chat/chat-composer.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./chat-composer";

describe("ChatComposer", () => {
  const baseProps = {
    status: "ready" as const,
    onSubmit: vi.fn(),
  };

  it("renders textarea and submit button", () => {
    render(<ChatComposer {...baseProps} />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
  });

  it("submits on send button click", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/send a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith("Hello");
  });

  it("submits on Enter without Shift", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/send a message/i), "Hello{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("Hello");
  });

  it("does not submit on Shift+Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} onSubmit={onSubmit} />);
    await user.type(
      screen.getByPlaceholderText(/send a message/i),
      "Hello{Shift>}{Enter}{/Shift}",
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables controls while loading", () => {
    render(<ChatComposer {...baseProps} status="streaming" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /stop/i })).toBeDisabled();
  });

  it("disables send for empty input", () => {
    render(<ChatComposer {...baseProps} />);

    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("trims whitespace before submitting", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/send a message/i), "  Hello  {Enter}");

    expect(onSubmit).toHaveBeenCalledWith("Hello");
  });
});
