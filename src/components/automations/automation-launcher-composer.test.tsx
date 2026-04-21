/**
 * Tests for the Automations launcher composer.
 * @module components/automations/automation-launcher-composer.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AutomationLauncherComposer } from "./automation-launcher-composer";

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

vi.mock("@/components/chat/chat-composer", () => ({
  ChatComposer: ({
    allowAttachments,
    onSelectedChatModelChange,
    onSubmit,
    onValueChange,
    placeholder,
    selectedChatModel,
    value,
  }: {
    allowAttachments?: boolean;
    onSelectedChatModelChange: (modelId: string) => void;
    onSubmit: (message: { text: string; files: [] }) => void;
    onValueChange: (value: string) => void;
    placeholder?: string;
    selectedChatModel: string;
    value: string;
  }) => (
    <div>
      <div data-testid="selected-chat-model">{selectedChatModel}</div>
      <div data-testid="allow-attachments">{String(allowAttachments)}</div>
      <input
        aria-label="automation launcher input"
        onChange={(event) => {
          onValueChange(event.currentTarget.value);
        }}
        placeholder={placeholder}
        value={value}
      />
      <button
        type="button"
        onClick={() => {
          onSelectedChatModelChange("anthropic/claude-haiku-4-5");
        }}
      >
        switch model
      </button>
      <button
        type="button"
        onClick={() => {
          onSubmit({ text: value, files: [] });
        }}
      >
        submit launcher
      </button>
    </div>
  ),
}));

describe("AutomationLauncherComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "chat-model=; path=/; max-age=0";
  });

  it("uses the persisted chat model cookie and disables attachments", () => {
    document.cookie = "chat-model=anthropic/claude-opus-4-6; path=/";

    render(<AutomationLauncherComposer />);

    expect(screen.getByTestId("selected-chat-model")).toHaveTextContent(
      "anthropic/claude-opus-4-6",
    );
    expect(screen.getByTestId("allow-attachments")).toHaveTextContent("false");
    expect(screen.getByPlaceholderText("Describe an automation to create...")).toBeInTheDocument();
  });

  it("persists model changes before redirecting into chat", async () => {
    const user = userEvent.setup();

    render(<AutomationLauncherComposer />);

    await user.click(screen.getByRole("button", { name: "switch model" }));

    expect(document.cookie).toContain("chat-model=anthropic/claude-haiku-4-5");
    expect(screen.getByTestId("selected-chat-model")).toHaveTextContent(
      "anthropic/claude-haiku-4-5",
    );
  });

  it("pushes the user into /chat with an autosubmitting automation prompt", async () => {
    const user = userEvent.setup();

    render(<AutomationLauncherComposer />);

    await user.type(screen.getByLabelText("automation launcher input"), "daily morning briefing");
    await user.click(screen.getByRole("button", { name: "submit launcher" }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      "/chat?prompt=Create+an+automation%3A+daily+morning+briefing&autosubmit=1",
    );
    expect(screen.getByLabelText("automation launcher input")).toHaveValue("");
  });
});
