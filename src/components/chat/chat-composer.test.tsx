/**
 * Tests for chat composer multimodal input behavior.
 * @module components/chat/chat-composer.test
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}));

import { ChatComposer } from "./chat-composer";

describe("ChatComposer", () => {
  const mockFetch = vi.fn();

  const baseProps = {
    status: "ready" as const,
    value: "",
    onValueChange: vi.fn(),
    onSubmit: vi.fn(),
    onStop: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("renders textarea, attachment control, and submit button", () => {
    render(<ChatComposer {...baseProps} />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attach files/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
  });

  it("shows monthly quota usage and an upgrade link when quota data is provided", () => {
    render(
      <ChatComposer
        {...baseProps}
        messageQuota={{
          clientId: "client-1",
          planName: "Free",
          monthlyMessageLimit: 100,
          messagesUsed: 34,
          messagesRemaining: 66,
          periodStart: "2026-03-01",
          nextResetDate: "2026-04-01",
        }}
      />,
    );

    expect(screen.getByText("34 / 100 messages used this month")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upgrade plan/i })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("submits trimmed value on send button click", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} value="  Hello  " onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Hello",
      files: [],
    });
  });

  it("submits on Enter without Shift", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} value="Hello" onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/send a message/i), "{Enter}");

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Hello",
      files: [],
    });
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

  it("uploads a selected image and allows attachment-only sends", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://storage.example.com/chat-attachments/client-1/photo.png",
          pathname: "photo.png",
          contentType: "image/png",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<ChatComposer {...baseProps} onSubmit={onSubmit} />);

    await user.upload(
      screen.getByLabelText(/upload attachments/i),
      new File(["photo"], "photo.png", { type: "image/png" }),
    );

    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "",
      files: [
        {
          type: "file",
          url: "https://storage.example.com/chat-attachments/client-1/photo.png",
          filename: "photo.png",
          mediaType: "image/png",
        },
      ],
    });
  });

  it("uploads pasted images through the React onPaste path", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://storage.example.com/chat-attachments/client-1/pasted.png",
          pathname: "pasted.png",
          contentType: "image/png",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<ChatComposer {...baseProps} onSubmit={onSubmit} />);

    const pastedFile = new File(["clipboard"], "pasted.png", { type: "image/png" });
    fireEvent.paste(screen.getByPlaceholderText(/send a message/i), {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => pastedFile,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText("pasted.png")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "",
      files: [
        {
          type: "file",
          url: "https://storage.example.com/chat-attachments/client-1/pasted.png",
          filename: "pasted.png",
          mediaType: "image/png",
        },
      ],
    });
  });

  it("keeps the stop button enabled while streaming", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} status="streaming" onStop={onStop} />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /stop/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /stop/i }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("locks the composer and attachment control when no messages remain", () => {
    render(
      <ChatComposer
        {...baseProps}
        messageQuota={{
          clientId: "client-1",
          planName: "Free",
          monthlyMessageLimit: 100,
          messagesUsed: 100,
          messagesRemaining: 0,
          periodStart: "2026-03-01",
          nextResetDate: "2026-04-01",
        }}
      />,
    );

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /attach files/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
    expect(screen.getByText(/monthly message limit reached/i)).toBeInTheDocument();
    expect(screen.getByText(/resets 1 apr 2026/i)).toBeInTheDocument();
  });

  it("disables submit for empty input when there are no attachments", () => {
    render(<ChatComposer {...baseProps} />);

    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("displays the controlled value in the textarea", () => {
    render(<ChatComposer {...baseProps} value="Set up a morning briefing" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toHaveValue(
      "Set up a morning briefing",
    );
  });

  it("calls onValueChange when the user types", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(<ChatComposer {...baseProps} onValueChange={onValueChange} />);
    await user.type(screen.getByPlaceholderText(/send a message/i), "H");

    expect(onValueChange).toHaveBeenCalledWith("H");
  });

  it("calls onValueChange with empty string on submit to clear the composer", async () => {
    const onValueChange = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <ChatComposer {...baseProps} value="Set up a morning briefing" onValueChange={onValueChange} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Set up a morning briefing",
      files: [],
    });
    expect(onValueChange).toHaveBeenCalledWith("");
  });
});
