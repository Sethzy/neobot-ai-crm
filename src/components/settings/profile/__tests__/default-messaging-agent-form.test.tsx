/**
 * Tests for the default messaging agent profile form.
 * @module components/settings/profile/__tests__/default-messaging-agent-form.test
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DefaultMessagingAgentForm } from "../default-messaging-agent-form";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
  }),
}));

describe("DefaultMessagingAgentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the available thread options", () => {
    render(
      <DefaultMessagingAgentForm
        initialDefaultThreadId="thread-1"
        threads={[
          { isPrimary: true, threadId: "thread-1", title: null },
          { isPrimary: false, threadId: "thread-2", title: "Buyers" },
        ]}
      />,
    );

    const select = screen.getByLabelText("Default messaging thread");
    expect(select).toHaveValue("thread-1");
    expect(screen.getByRole("option", { name: "Main conversation" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Buyers" })).toBeInTheDocument();
  });

  it("disables save when there are no changes", () => {
    render(
      <DefaultMessagingAgentForm
        initialDefaultThreadId="thread-1"
        threads={[
          { isPrimary: true, threadId: "thread-1", title: null },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the selected thread through the profile API", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          defaultThreadId: "thread-2",
        }),
        { status: 200 },
      ),
    );

    render(
      <DefaultMessagingAgentForm
        initialDefaultThreadId="thread-1"
        threads={[
          { isPrimary: true, threadId: "thread-1", title: null },
          { isPrimary: false, threadId: "thread-2", title: "Buyers" },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Default messaging thread"), {
      target: { value: "thread-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings/profile/default-messaging-thread", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "thread-2" }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Saved.")).toBeInTheDocument();
    });
    expect(refresh).toHaveBeenCalled();
  });
});
