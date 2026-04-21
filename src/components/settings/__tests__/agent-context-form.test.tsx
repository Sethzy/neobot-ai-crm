/**
 * Tests for the agent-context form client component.
 * @module components/settings/agent-context-form.test
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/markdown-editor", () => ({
  MarkdownEditor: ({
    ariaLabel,
    disabled,
    maxLength,
    onChange,
    value,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    maxLength?: number;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      data-max-length={maxLength}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import { AgentContextForm } from "../agent-context-form";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
  }),
}));

describe("AgentContextForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the existing values", () => {
    render(
      <AgentContextForm
        initialClientProfile="Calm, practical."
        initialUserPreferences="Prefers bullets."
      />,
    );

    expect(screen.getByLabelText("Client profile")).toHaveValue("Calm, practical.");
    expect(screen.getByLabelText("User preferences")).toHaveValue("Prefers bullets.");
  });

  it("passes both fields through the shared markdown editor", () => {
    render(
      <AgentContextForm
        initialClientProfile="Calm, practical."
        initialUserPreferences="Prefers bullets."
      />,
    );

    const clientProfileInput = screen.getByLabelText("Client profile");
    const userPreferencesInput = screen.getByLabelText("User preferences");

    expect(clientProfileInput).toHaveAttribute("data-max-length", "100000");
    expect(userPreferencesInput).toHaveAttribute("data-max-length", "100000");
  });

  it("disables save when nothing changed", () => {
    render(
      <AgentContextForm
        initialClientProfile="Calm, practical."
        initialUserPreferences="Prefers bullets."
      />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves edited values through the API route", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          client_profile: "Updated profile",
          user_preferences: "Updated preferences",
        }),
        { status: 200 },
      ),
    );

    render(
      <AgentContextForm
        initialClientProfile="Calm, practical."
        initialUserPreferences="Prefers bullets."
      />,
    );

    fireEvent.change(screen.getByLabelText("Client profile"), {
      target: { value: "Updated profile" },
    });
    fireEvent.change(screen.getByLabelText("User preferences"), {
      target: { value: "Updated preferences" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings/agent-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_profile: "Updated profile",
          user_preferences: "Updated preferences",
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Saved.")).toBeInTheDocument();
    });
    expect(refresh).toHaveBeenCalled();
  });
});
