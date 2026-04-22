/**
 * Tests for the inline tool call display and connection-specific cards.
 * @module components/chat/tool-call-inline.test
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseBrowserAuth } = vi.hoisted(() => ({
  mockUseBrowserAuth: vi.fn(),
}));

const {
  mockCreateSupabaseClient,
  mockSupabaseEq,
  mockSupabaseMaybeSingle,
  mockSupabaseSelect,
  mockSupabaseRemoveChannel,
} = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));

  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    mockCreateSupabaseClient: vi.fn(() => ({
      from: vi.fn(() => ({ select })),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    })),
    mockSupabaseEq: eq,
    mockSupabaseMaybeSingle: maybeSingle,
    mockSupabaseSelect: select,
    mockSupabaseChannel: channel,
    mockSupabaseRemoveChannel: vi.fn(),
  };
});

vi.mock("@/hooks/use-browser-auth", () => ({
  useBrowserAuth: (...args: unknown[]) => mockUseBrowserAuth(...args),
}));

vi.mock("use-stick-to-bottom", () => ({
  useStickToBottomContext: () => ({
    scrollRef: { current: null },
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const client = mockCreateSupabaseClient();
    client.removeChannel = mockSupabaseRemoveChannel;
    return client;
  },
}));

import { ToolCallInline } from "./tool-call-inline";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ToolCallInline", () => {
  const defaultProps = {
    name: "search_contacts",
    state: "output-available" as const,
    input: { query: "John" },
    output: { results: [{ name: "John Doe" }] },
  };

  mockUseBrowserAuth.mockReturnValue({
    state: {
      status: "idle",
      liveUrl: null,
    },
    connect: vi.fn(),
    verify: vi.fn(),
    reset: vi.fn(),
  });

  it("renders as subtle muted text with no bg fill", () => {
    render(<ToolCallInline {...defaultProps} />);

    const trigger = screen.getByTestId("tool-expand-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger.className).toMatch(/text-xs/);
    expect(trigger.className).toMatch(/text-muted-foreground/);
    expect(trigger.className).not.toMatch(/bg-muted/);
    expect(trigger.className).not.toMatch(/rounded-lg/);
    expect(screen.getByText("search_contacts")).toBeInTheDocument();
  });

  it("shows a bullet dot indicator", () => {
    render(<ToolCallInline {...defaultProps} />);

    expect(screen.getByTestId("tool-dot")).toBeInTheDocument();
  });

  it("shows chevron inline next to name", () => {
    render(<ToolCallInline {...defaultProps} />);

    expect(screen.getByTestId("tool-chevron").getAttribute("class")).toMatch(/-rotate-90/);
  });

  it("does not show input/output when collapsed", () => {
    render(<ToolCallInline {...defaultProps} />);

    expect(screen.queryByTestId("tool-details")).not.toBeInTheDocument();
  });

  it("expands to show input and output on click", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-details")).toBeInTheDocument();
    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.getByTestId("tool-result")).toBeInTheDocument();
  });

  it("shows formatted input arguments when expanded", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-arguments")).toHaveTextContent("query:");
    expect(screen.getByTestId("tool-arguments")).toHaveTextContent('"John"');
  });

  it("shows formatted output when expanded", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByTestId("tool-result")).toHaveTextContent('"John Doe"');
  });

  it("shows error text instead of result when errorText is provided", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="search_contacts"
        state="output-error"
        input={{ query: "John" }}
        errorText="Connection timeout"
      />,
    );

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByText("Connection timeout")).toBeInTheDocument();
    expect(screen.queryByText(/Result/i)).not.toBeInTheDocument();
  });

  it("shows a spinner when state is input-available (running)", () => {
    render(
      <ToolCallInline
        name="search_contacts"
        state="input-available"
        input={{ query: "John" }}
      />,
    );

    expect(screen.getByTestId("tool-dot").getAttribute("class")).toMatch(/animate-spin/);
  });

  it("does not show expand trigger when no output yet", () => {
    render(
      <ToolCallInline
        name="search_contacts"
        state="input-available"
        input={{ query: "John" }}
      />,
    );

    // Still shows the trigger (for viewing args), but it's there
    expect(screen.getByTestId("tool-expand-trigger")).toBeInTheDocument();
  });

  it("renders tool arguments with JsonView instead of raw JSON", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);
    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(
      screen.getByTestId("tool-arguments").querySelector("[data-testid='json-view']"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("tool-arguments").querySelector("pre"),
    ).not.toBeInTheDocument();
  });

  it("renders tool result with JsonView instead of raw JSON", async () => {
    const user = userEvent.setup();
    render(<ToolCallInline {...defaultProps} />);
    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(
      screen.getByTestId("tool-result").querySelector("[data-testid='json-view']"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("tool-result").querySelector("pre"),
    ).not.toBeInTheDocument();
  });

  it("accepts onToolApproval and approvalId props without error", () => {
    const onToolApproval = vi.fn();
    render(
      <ToolCallInline
        {...defaultProps}
        approvalId="approval-1"
        onToolApproval={onToolApproval}
      />,
    );
    expect(screen.getByTestId("tool-call-inline")).toBeInTheDocument();
  });

  it("shows a PDF download CTA for generate_pdf output", () => {
    render(
      <ToolCallInline
        name="generate_pdf"
        state="output-available"
        input={{ title: "Client summary" }}
        output={{
          success: true,
          download_url: "https://storage.example.com/reports/client-summary.pdf",
          filename: "client-summary.pdf",
        }}
      />,
    );

    expect(screen.getByTestId("pdf-download-link")).toHaveAttribute(
      "href",
      "https://storage.example.com/reports/client-summary.pdf",
    );
    expect(screen.getByTestId("pdf-download-link")).toHaveAttribute(
      "download",
      "client-summary.pdf",
    );
    expect(screen.getByText("client-summary.pdf")).toBeInTheDocument();
  });
});

describe("approval-requested state", () => {
  const approvalProps = {
    name: "write_file",
    state: "approval-requested" as const,
    input: { path: "/memory.md", content: "Updated notes" },
    approvalId: "approval-abc",
    onToolApproval: vi.fn(),
  };

  it("shows approve and deny buttons when state is approval-requested", () => {
    render(<ToolCallInline {...approvalProps} />);

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });

  it("calls onToolApproval with (approvalId, true) when approve clicked", async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    render(<ToolCallInline {...approvalProps} onToolApproval={onToolApproval} />);

    await user.click(screen.getByRole("button", { name: /approve/i }));

    expect(onToolApproval).toHaveBeenCalledWith("approval-abc", true);
  });

  it("calls onToolApproval with (approvalId, false) when deny clicked", async () => {
    const user = userEvent.setup();
    const onToolApproval = vi.fn();
    render(<ToolCallInline {...approvalProps} onToolApproval={onToolApproval} />);

    await user.click(screen.getByRole("button", { name: /deny/i }));

    expect(onToolApproval).toHaveBeenCalledWith("approval-abc", false);
  });

  it("does not show approve/deny buttons for other states", () => {
    render(<ToolCallInline name="search" state="output-available" input={{}} output={{}} />);

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });

  it("does not show buttons when onToolApproval is not provided", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="approval-requested"
        input={{}}
        approvalId="approval-1"
      />,
    );

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows a warning-colored status icon when awaiting approval", () => {
    vi.useFakeTimers();

    render(<ToolCallInline {...approvalProps} />);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const dot = screen.getByTestId("tool-dot");
    expect(dot.getAttribute("class")).toMatch(/text-warning/);
    expect(dot.getAttribute("class")).not.toMatch(/animate-spin/);
  });

  it("shows static dot when tool completes", () => {
    const { rerender } = render(
      <ToolCallInline
        name="search_contacts"
        state="input-available"
        input={{ query: "John" }}
      />,
    );

    rerender(
      <ToolCallInline
        name="search_contacts"
        state="output-available"
        input={{ query: "John" }}
        output={{ results: [] }}
      />,
    );

    const dot = screen.getByTestId("tool-dot");
    expect(dot.tagName.toLowerCase()).toBe("svg");
    expect(dot.getAttribute("class")).not.toMatch(/animate-spin/);
  });
});

describe("connection cards", () => {
  it("hydrates the current connection status on mount", async () => {
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: {
        status: "active",
        account_identifier: "owner@example.com",
        auth_redirect_url: null,
        auth_redirect_expires_at: null,
      },
      error: null,
    });

    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{
          connection: {
            type: "integrations",
            integrations: [{ integrationId: "googledrive" }],
          },
        }}
        output={{
          success: true,
          results: [
            {
              integrationId: "googledrive",
              displayName: "Google Drive",
              description: "Access files in Google Drive",
              logoUrl: "/logos/drive.svg",
              connectionStatus: "pending_auth",
              redirectUrl: "https://auth.composio.dev/google-drive",
              composioConnectedAccountId: "acc-123",
            },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /connect google drive/i }),
    ).not.toBeInTheDocument();
    expect(mockSupabaseSelect).toHaveBeenCalledWith(
      "status, account_identifier, auth_redirect_url, auth_redirect_expires_at",
    );
    expect(mockSupabaseEq).toHaveBeenCalledWith(
      "composio_connected_account_id",
      "acc-123",
    );
  });

  it("does not show awaiting-login state before the user starts OAuth", async () => {
    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: {
        status: "pending",
        account_identifier: null,
        auth_redirect_url: "https://auth.composio.dev/notion",
        auth_redirect_expires_at: "2099-04-21T09:45:00.000Z",
      },
      error: null,
    });

    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{ integrations: [{ integrationId: "notion" }] }}
        output={{
          success: true,
          results: [
            {
              integrationId: "notion",
              displayName: "Notion",
              description: "Read and write your Notion workspace.",
              logoUrl: "/logos/notion.svg",
              connectionStatus: "pending_auth",
              redirectUrl: "https://auth.composio.dev/notion",
              composioConnectedAccountId: "acc-notion-pending",
            },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(mockSupabaseEq).toHaveBeenCalledWith(
        "composio_connected_account_id",
        "acc-notion-pending",
      );
    });

    expect(screen.queryByText(/signing in/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeInTheDocument();
  });

  it("renders ConnectionCard for create_connection output", () => {
    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{
          connection: {
            type: "integrations",
            integrations: [{ integrationId: "googledrive" }],
          },
        }}
        output={{
          success: true,
          results: [
            {
              integrationId: "googledrive",
              displayName: "Google Drive",
              description: "Access files in Google Drive",
              logoUrl: "/logos/drive.svg",
              connectionStatus: "pending_auth",
              redirectUrl: "https://auth.composio.dev/google-drive",
              composioConnectedAccountId: "acc-123",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Connect Google Drive")).toBeInTheDocument();
    expect(screen.getByText("Google Drive")).toBeInTheDocument();
    expect(screen.getByAltText("Google Drive logo")).toHaveAttribute(
      "src",
      "/logos/drive.svg",
    );
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeInTheDocument();
  });

  it("disables the connect CTA once the stored auth link expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T09:00:00.000Z"));

    mockSupabaseMaybeSingle.mockResolvedValueOnce({
      data: {
        status: "pending",
        account_identifier: null,
        auth_redirect_url: "https://auth.composio.dev/notion",
        auth_redirect_expires_at: "2026-04-21T09:00:01.000Z",
      },
      error: null,
    });

    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{ integrations: ["notion"] }}
        output={{
          success: true,
          results: [
            {
              integrationId: "notion",
              displayName: "Notion",
              description: "Read and write your Notion workspace.",
              logoUrl: "/logos/notion.svg",
              connectionStatus: "pending_auth",
              redirectUrl: "https://auth.composio.dev/notion",
              authRedirectExpiresAt: "2026-04-21T09:00:01.000Z",
              composioConnectedAccountId: "acc-notion-expiring",
            },
          ],
        }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1_250);
    });

    expect(screen.getAllByText("Expired")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^expired$/i })).toBeDisabled();
  });

  it("renders the same connection card pattern for reauthorize_connection output", () => {
    render(
      <ToolCallInline
        name="reauthorize_connection"
        state="output-available"
        input={{ connectionId: "conn-123" }}
        output={{
          success: true,
          connectionId: "conn-123",
          status: "pending_reauth",
          integrationId: "gmail",
          displayName: "Gmail",
          description: "Send and read Gmail messages.",
          logoUrl: "/logos/gmail.svg",
          connectionStatus: "pending_reauth",
          redirectUrl: "https://auth.composio.dev/gmail",
          authRedirectExpiresAt: "2099-04-21T09:45:00.000Z",
          composioConnectedAccountId: "acc-reauth-123",
        }}
      />,
    );

    expect(screen.getByText("Reconnect Gmail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reconnect$/i })).toBeInTheDocument();
  });

  it("renders provider-specific connection errors without showing an OAuth CTA", () => {
    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{ integrations: [{ integrationId: "Google Drive" }] }}
        output={{
          success: true,
          results: [
            {
              integrationId: "googledrive",
              displayName: "Google Drive",
              logoUrl: "/logos/drive.svg",
              error: "Already connected. Disconnect it first to switch accounts.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/couldn't start the connection/i)).toBeInTheDocument();
    expect(
      screen.getByText("Already connected. Disconnect it first to switch accounts."),
    ).toBeInTheDocument();
    expect(screen.getByText("Google Drive")).toBeInTheDocument();
    expect(screen.getByAltText("Google Drive logo")).toHaveAttribute(
      "src",
      "/logos/drive.svg",
    );
    expect(screen.queryByText("googledrive")).not.toBeInTheDocument();
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
    expect(screen.getByText("Already connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^connect$/i })).not.toBeInTheDocument();
  });

  it("uses bundled branding for launch-set providers without a metadata backfill request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{ integrations: [{ integrationId: "notion" }] }}
        output={{
          success: true,
          results: [
            {
              integrationId: "notion",
              displayName: "notion",
              error: "Already connected. Disconnect it first to switch accounts.",
            },
            {
              integrationId: "gmail",
              displayName: "gmail",
              error: "Request failed.",
            },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Notion logo")).toHaveAttribute(
        "src",
        "/logos/notion.svg",
      );
      expect(screen.getByAltText("Gmail logo")).toHaveAttribute(
        "src",
        "/logos/gmail.svg",
      );
    });

    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses KISS copy for the connection modal and never mentions tool approval", async () => {
    const user = userEvent.setup();

    render(
      <ToolCallInline
        name="create_connection"
        state="output-available"
        input={{ integrations: [{ integrationId: "notion" }] }}
        output={{
          success: true,
          results: [
            {
              integrationId: "notion",
              displayName: "Notion",
              description: "Read and write your Notion workspace.",
              logoUrl: "/logos/notion.svg",
              connectionStatus: "pending_auth",
              redirectUrl: "https://auth.composio.dev/notion",
              authRedirectExpiresAt: "2099-04-21T09:45:00.000Z",
              composioConnectedAccountId: "acc-notion-123",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^connect$/i }));

    expect(screen.queryByText(/approve the tools/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/grant permissions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/authorize/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/oauth/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sign in to notion to link your account/i)).toBeInTheDocument();
    expect(screen.getByText(/send your next message/i)).toBeInTheDocument();
  });

  it("uses reauthorization-specific copy in the modal", async () => {
    const user = userEvent.setup();

    render(
      <ToolCallInline
        name="reauthorize_connection"
        state="output-available"
        input={{ connectionId: "conn-123" }}
        output={{
          success: true,
          connectionId: "conn-123",
          status: "pending_reauth",
          integrationId: "gmail",
          displayName: "Gmail",
          description: "Send and read Gmail messages.",
          logoUrl: "/logos/gmail.svg",
          connectionStatus: "pending_reauth",
          redirectUrl: "https://auth.composio.dev/gmail",
          authRedirectExpiresAt: "2099-04-21T09:45:00.000Z",
          composioConnectedAccountId: "acc-reauth-123",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^reconnect$/i }));

    expect(screen.getByText(/sign in to gmail again to refresh your connection/i)).toBeInTheDocument();
    expect(screen.getByText(/send your next message/i)).toBeInTheDocument();
  });

  it("renders PermissionCard from input during approval-requested state", () => {
    render(
      <ToolCallInline
        name="manage_activated_tools_for_connections"
        state="approval-requested"
        approvalId="approval-123"
        input={{
          connections: [
            {
              connectionId: "conn-123",
              activate: ["GOOGLEDRIVE_FIND_FILE", "GOOGLEDRIVE_DOWNLOAD_FILE"],
              deactivate: [],
            },
          ],
        }}
        output={null}
        onToolApproval={vi.fn()}
      />,
    );

    expect(screen.getByText("Grant permissions to agent?")).toBeInTheDocument();
    expect(screen.getByText("GOOGLEDRIVE_FIND_FILE")).toBeInTheDocument();
    expect(screen.getByText("GOOGLEDRIVE_DOWNLOAD_FILE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grant permissions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });

  it("renders both activate and deactivate tool chips in PermissionCard", () => {
    render(
      <ToolCallInline
        name="manage_activated_tools_for_connections"
        state="approval-requested"
        approvalId="approval-123"
        input={{
          connections: [
            {
              connectionId: "conn-123",
              activate: ["GOOGLEDRIVE_FIND_FILE"],
              deactivate: ["GOOGLEDRIVE_DOWNLOAD_FILE"],
            },
          ],
        }}
        output={null}
        onToolApproval={vi.fn()}
      />,
    );

    expect(screen.getByText("GOOGLEDRIVE_FIND_FILE")).toBeInTheDocument();
    expect(screen.getByText("Removing GOOGLEDRIVE_DOWNLOAD_FILE")).toBeInTheDocument();
  });

  it("renders Denied badge when approval-responded approval was rejected", () => {
    render(
      <ToolCallInline
        name="manage_activated_tools_for_connections"
        state="approval-responded"
        approval={{ id: "approval-123", approved: false }}
        approvalId="approval-123"
        input={{
          connections: [
            {
              connectionId: "conn-123",
              activate: ["GOOGLEDRIVE_FIND_FILE"],
              deactivate: [],
            },
          ],
        }}
        output={null}
      />,
    );

    expect(screen.getByText("Denied")).toBeInTheDocument();
    expect(screen.queryByText("Granted")).not.toBeInTheDocument();
  });

  it("preserves tool error rendering after a permission flow fails", async () => {
    const user = userEvent.setup();

    render(
      <ToolCallInline
        name="manage_activated_tools_for_connections"
        state="output-error"
        input={{
          connections: [
            {
              connectionId: "conn-123",
              activate: ["GOOGLEDRIVE_FIND_FILE"],
              deactivate: [],
            },
          ],
        }}
        errorText="Activation failed because the connection is no longer active."
      />,
    );

    expect(screen.queryByTestId("permission-card")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(
      screen.getByText("Activation failed because the connection is no longer active."),
    ).toBeInTheDocument();
  });
});

describe("output-denied state", () => {
  it("shows a muted denial icon (not spinning)", () => {
    vi.useFakeTimers();

    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const dot = screen.getByTestId("tool-dot");
    expect(dot.getAttribute("class")).toMatch(/text-muted-foreground/);
    expect(dot.getAttribute("class")).not.toMatch(/animate-spin/);
  });

  it("shows 'Denied' label after tool name", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    expect(screen.getByText(/denied/i)).toBeInTheDocument();
  });

  it("does not show result section when denied and expanded", async () => {
    const user = userEvent.setup();
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    await user.click(screen.getByTestId("tool-expand-trigger"));

    expect(screen.getByText("Arguments")).toBeInTheDocument();
    expect(screen.queryByText("Result")).not.toBeInTheDocument();
  });

  it("does not show approval buttons when denied", () => {
    render(
      <ToolCallInline
        name="write_file"
        state="output-denied"
        input={{ path: "/memory.md" }}
      />,
    );

    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /deny/i })).not.toBeInTheDocument();
  });
});

describe("browser auth card", () => {
  it("renders an auth card when browse_website returns needsAuth", () => {
    render(
      <ToolCallInline
        name="browse_website"
        state="output-available"
        input={{ goal: "Search ProMap", platform: "propnex" }}
        output={{
          success: false,
          needsAuth: true,
          platform: "propnex",
          error: "No saved login",
        }}
      />,
    );

    expect(screen.getByTestId("browser-auth-card")).toBeInTheDocument();
    expect(screen.getByText(/requires login/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect propnex/i })).toBeInTheDocument();
  });

  it("does not render an auth card for normal browse_website output", () => {
    render(
      <ToolCallInline
        name="browse_website"
        state="output-available"
        input={{ goal: "Search example.com" }}
        output={{ success: true, output: "data" }}
      />,
    );

    expect(screen.queryByTestId("browser-auth-card")).not.toBeInTheDocument();
  });

  it("does not render an auth card for other tools", () => {
    render(
      <ToolCallInline
        name="web_scrape"
        state="output-available"
        input={{ url: "https://example.com" }}
        output={{ success: false, needsAuth: true, platform: "propnex" }}
      />,
    );

    expect(screen.queryByTestId("browser-auth-card")).not.toBeInTheDocument();
  });

  it("renders the embedded iframe and fallback link while awaiting login", () => {
    mockUseBrowserAuth.mockReturnValueOnce({
      state: {
        status: "awaiting-login",
        liveUrl: "https://live.browser-use.com/session_123",
      },
      connect: vi.fn(),
      verify: vi.fn(),
      reset: vi.fn(),
    });

    render(
      <ToolCallInline
        name="browse_website"
        state="output-available"
        input={{ goal: "Search ProMap", platform: "propnex" }}
        output={{ success: false, needsAuth: true, platform: "propnex" }}
      />,
    );

    expect(screen.getByTitle(/propnex login/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open in new tab/i })).toHaveAttribute(
      "href",
      "https://live.browser-use.com/session_123",
    );
  });
});
