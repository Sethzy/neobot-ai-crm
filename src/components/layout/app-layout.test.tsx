/**
 * Tests for AppLayout component.
 * @module components/layout/app-layout.test
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "./app-layout";
import { UploadProvider } from "@/contexts/upload-context";

vi.mock("./app-sidebar", () => ({
  AppSidebar: ({ onOpenCommandMenu }: { onOpenCommandMenu?: () => void }) => (
    <button type="button" data-testid="sidebar-open-search" onClick={onOpenCommandMenu}>
      Sidebar
    </button>
  ),
}));

vi.mock("@/components/command-menu", () => ({
  CommandMenu: ({ open }: { open: boolean }) => <div data-testid="command-menu" data-open={open} />,
}));

// Mock file utils to prevent actual processing
vi.mock("@/lib/file-utils", () => ({
  validateFileType: vi.fn(() => true),
  validateFileSize: vi.fn(() => true),
  computeFileHash: vi.fn(() => Promise.resolve("abc123")),
  getFileExtension: vi.fn(() => "pdf"),
}));

// Mock supabase to prevent actual API calls
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null } })) },
    from: vi.fn(() => ({ select: vi.fn() })),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <UploadProvider>{children}</UploadProvider>
  </QueryClientProvider>
);

describe("AppLayout", () => {
  it("renders sidebar and children", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
      { wrapper }
    );
    expect(screen.getByTestId("sidebar-open-search")).toBeInTheDocument();
    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });

  it("opens command menu when pressing Cmd+K", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
      { wrapper },
    );

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(screen.getByTestId("command-menu")).toHaveAttribute("data-open", "true");
  });

  it("opens command menu when sidebar triggers search", () => {
    render(
      <AppLayout>
        <div>Page Content</div>
      </AppLayout>,
      { wrapper },
    );

    fireEvent.click(screen.getByTestId("sidebar-open-search"));

    expect(screen.getByTestId("command-menu")).toHaveAttribute("data-open", "true");
  });
});
