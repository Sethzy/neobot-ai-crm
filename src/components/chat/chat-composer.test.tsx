/**
 * Tests for chat composer multimodal input behavior.
 * @module components/chat/chat-composer.test
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImgHTMLAttributes, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { CHAT_ATTACHMENT_ACCEPT } from "@/lib/chat/attachment-config";

const {
  mockToastError,
  mockUploadToSignedUrl,
  mockStorageFrom,
  mockUseInstalledSkills,
} = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockUploadToSignedUrl: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockUseInstalledSkills: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    const { unoptimized, ...imageProps } = props;
    void unoptimized;
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: mockStorageFrom.mockImplementation(() => ({
        uploadToSignedUrl: mockUploadToSignedUrl,
      })),
    },
  })),
}));

vi.mock("@/hooks/use-installed-skills", () => ({
  useInstalledSkills: mockUseInstalledSkills,
}));

vi.mock("./preview-attachment", () => ({
  PreviewAttachment: ({
    attachment,
    isUploading,
    onRemove,
  }: {
    attachment: { filename: string };
    isUploading?: boolean;
    onRemove?: () => void;
  }) => (
    <div data-testid={isUploading ? "uploading-attachment" : "attachment-preview"}>
      <span>{attachment.filename}</span>
      {onRemove ? <button onClick={onRemove} type="button">Remove</button> : null}
    </div>
  ),
}));

import { ChatComposer } from "./chat-composer";

function renderComposer(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ChatComposer", () => {
  const mockFetch = vi.fn();

  const baseProps = {
    status: "ready" as const,
    value: "",
    onValueChange: vi.fn(),
    onSubmit: vi.fn(),
    selectedChatModel: "anthropic/claude-sonnet-4-6",
    onSelectedChatModelChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockUseInstalledSkills.mockReturnValue({
      data: [],
      isError: false,
      isLoading: false,
    });
    mockUploadToSignedUrl.mockResolvedValue({
      data: { path: "uploads/photo.png" },
      error: null,
    });
  });

  it("renders textarea, model selector, attachment control, and submit button", () => {
    renderComposer(<ChatComposer {...baseProps} />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claude sonnet 4\.6/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /attach files/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload attachments/i)).toHaveAttribute(
      "accept",
      CHAT_ATTACHMENT_ACCEPT,
    );
  });

  it("renders phone-safe composer controls", () => {
    renderComposer(<ChatComposer {...baseProps} />);

    expect(screen.getByRole("button", { name: /attach files/i })).toHaveClass("max-sm:size-11");
    expect(screen.getByRole("button", { name: /submit/i })).toHaveClass("max-sm:size-11");
  });

  it("lets the user switch the selected chat model", async () => {
    const onSelectedChatModelChange = vi.fn();
    const user = userEvent.setup();

    renderComposer(
      <ChatComposer
        {...baseProps}
        onSelectedChatModelChange={onSelectedChatModelChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /claude sonnet 4\.6/i }));
    await user.click(screen.getByRole("button", { name: /basic.*haiku 4\.5/i }));

    expect(onSelectedChatModelChange).toHaveBeenCalledWith("anthropic/claude-haiku-4-5");
  });

  it("does not render quota UI inside the composer", () => {
    renderComposer(<ChatComposer {...baseProps} />);

    expect(screen.queryByText(/messages used/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /upgrade plan/i })).not.toBeInTheDocument();
  });

  it("submits trimmed value on send button click", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderComposer(<ChatComposer {...baseProps} value="  Hello  " onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Hello",
      files: [],
    });
  });

  it("keeps the draft when the parent rejects a submit attempt", async () => {
    const onSubmit = vi.fn(() => false);
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    renderComposer(
      <ChatComposer
        {...baseProps}
        value="  Keep this  "
        onSubmit={onSubmit}
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Keep this",
      files: [],
    });
    expect(onValueChange).not.toHaveBeenCalledWith("");
    expect(screen.getByPlaceholderText(/send a message/i)).toHaveValue("  Keep this  ");
  });

  it("submits on Enter without Shift", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderComposer(<ChatComposer {...baseProps} value="Hello" onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/send a message/i), "{Enter}");

    expect(onSubmit).toHaveBeenCalledWith({
      text: "Hello",
      files: [],
    });
  });

  it("does not submit on Shift+Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderComposer(<ChatComposer {...baseProps} onSubmit={onSubmit} />);
    await user.type(
      screen.getByPlaceholderText(/send a message/i),
      "Hello{Shift>}{Enter}{/Shift}",
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows installed skill autocomplete for slash commands and inserts the selected skill", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    mockUseInstalledSkills.mockReturnValue({
      data: [
        {
          slug: "call-prep",
          name: "call-prep",
          description: "Prepare for an upcoming client call.",
        },
      ],
      isError: false,
      isLoading: false,
    });

    renderComposer(
      <ChatComposer
        {...baseProps}
        value="/c"
        onValueChange={onValueChange}
      />,
    );

    const textarea = screen.getByPlaceholderText(/send a message/i) as HTMLTextAreaElement;
    textarea.setSelectionRange(2, 2);
    fireEvent.click(textarea);
    fireEvent.select(textarea);

    expect(await screen.findByTestId("skill-autocomplete")).toBeInTheDocument();

    await user.click(screen.getByText("/call-prep"));

    expect(onValueChange).toHaveBeenCalledWith("/call-prep ");
  });

  it("uploads a selected image and allows attachment-only sends", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedUrl: "https://storage.example.com/upload/sign/path",
            token: "upload-token",
            path: "client-1/uploads/photo.png",
            storagePath: "uploads/photo.png",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://storage.example.com/agent-files/client-1/uploads/photo.png?token=signed",
            storagePath: "uploads/photo.png",
            pathname: "photo.png",
            contentType: "image/png",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    renderComposer(<ChatComposer {...baseProps} onSubmit={onSubmit} />);

    await user.upload(
      screen.getByLabelText(/upload attachments/i),
      new File(["photo"], "photo.png", { type: "image/png" }),
    );

    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenNthCalledWith(1, "/api/files/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "photo.png",
        contentType: "image/png",
        size: 5,
      }),
    });
    expect(mockStorageFrom).toHaveBeenCalledWith("agent-files");
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      "client-1/uploads/photo.png",
      "upload-token",
      expect.any(File),
      {
        cacheControl: "3600",
        upsert: false,
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/files/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath: "uploads/photo.png",
        filename: "photo.png",
        contentType: "image/png",
        size: 5,
      }),
    });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "",
      files: [
        {
          type: "file",
          url: "https://storage.example.com/agent-files/client-1/uploads/photo.png?token=signed",
          filename: "photo.png",
          mediaType: "image/png",
          storagePath: "uploads/photo.png",
        },
      ],
    });
  });

  it("uploads a selected spreadsheet attachment and preserves its media type", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    mockUploadToSignedUrl.mockResolvedValueOnce({
      data: { path: "uploads/deals.csv" },
      error: null,
    });
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedUrl: "https://storage.example.com/upload/sign/deals",
            token: "upload-token-csv",
            path: "client-1/uploads/deals.csv",
            storagePath: "uploads/deals.csv",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://storage.example.com/agent-files/client-1/uploads/deals.csv?token=signed",
            storagePath: "uploads/deals.csv",
            pathname: "deals.csv",
            contentType: "text/csv",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    renderComposer(<ChatComposer {...baseProps} onSubmit={onSubmit} />);

    await user.upload(
      screen.getByLabelText(/upload attachments/i),
      new File(["a,b\n1,2"], "deals.csv", { type: "text/csv" }),
    );

    await waitFor(() => {
      expect(screen.getByText("deals.csv")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "",
      files: [
        {
          type: "file",
          url: "https://storage.example.com/agent-files/client-1/uploads/deals.csv?token=signed",
          filename: "deals.csv",
          mediaType: "text/csv",
          storagePath: "uploads/deals.csv",
        },
      ],
    });
  });

  it("uploads pasted images through the React onPaste path", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    mockUploadToSignedUrl.mockResolvedValueOnce({
      data: { path: "uploads/pasted.png" },
      error: null,
    });
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedUrl: "https://storage.example.com/upload/sign/pasted",
            token: "upload-token-pasted",
            path: "client-1/uploads/pasted.png",
            storagePath: "uploads/pasted.png",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://storage.example.com/agent-files/client-1/uploads/pasted.png?token=signed",
            storagePath: "uploads/pasted.png",
            pathname: "pasted.png",
            contentType: "image/png",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    renderComposer(<ChatComposer {...baseProps} onSubmit={onSubmit} />);

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
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(screen.getByText("pasted.png")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      text: "",
      files: [
        {
          type: "file",
          url: "https://storage.example.com/agent-files/client-1/uploads/pasted.png?token=signed",
          filename: "pasted.png",
          mediaType: "image/png",
          storagePath: "uploads/pasted.png",
        },
      ],
    });
  });

  it("keeps the stop button enabled while streaming", async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();

    renderComposer(<ChatComposer {...baseProps} status="streaming" onStop={onStop} />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /stop/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /stop/i }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not expose stop while submitted (onStop not provided)", () => {
    renderComposer(<ChatComposer {...baseProps} status="submitted" onStop={undefined} value="Hello" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("locks the composer and attachment control when disabled", () => {
    renderComposer(
      <ChatComposer
        {...baseProps}
        disabled
      />,
    );

    expect(screen.getByPlaceholderText(/send a message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /attach files/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("disables submit for empty input when there are no attachments", () => {
    renderComposer(<ChatComposer {...baseProps} />);

    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("displays the controlled value in the textarea", () => {
    renderComposer(<ChatComposer {...baseProps} value="Set up a morning briefing" />);

    expect(screen.getByPlaceholderText(/send a message/i)).toHaveValue(
      "Set up a morning briefing",
    );
  });

  it("calls onValueChange when the user types", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    renderComposer(<ChatComposer {...baseProps} onValueChange={onValueChange} />);
    await user.type(screen.getByPlaceholderText(/send a message/i), "H");

    expect(onValueChange).toHaveBeenCalledWith("H");
  });

  it("calls onValueChange with empty string on submit to clear the composer", async () => {
    const onValueChange = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderComposer(
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
