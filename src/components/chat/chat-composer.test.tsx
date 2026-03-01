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
    value: "",
    onValueChange: vi.fn(),
    onSubmit: vi.fn(),
    isLoading: false,
  };

  it("renders textarea and send button", () => {
    render(<ChatComposer {...baseProps} />);

    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
  });

  it("calls onValueChange when user types", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} onValueChange={onValueChange} />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "a");

    expect(onValueChange).toHaveBeenCalled();
  });

  it("submits on send button click", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} value="Hello" onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits on Enter without Shift", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} value="Hello" onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit on Shift+Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} value="Hello" onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/type a message/i), "{Shift>}{Enter}{/Shift}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables controls while loading", () => {
    render(<ChatComposer {...baseProps} value="Hello" isLoading />);

    expect(screen.getByPlaceholderText(/type a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });

  it("disables send for empty and whitespace-only input", () => {
    const { rerender } = render(<ChatComposer {...baseProps} value="" />);

    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();

    rerender(<ChatComposer {...baseProps} value="   " />);
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });
});
