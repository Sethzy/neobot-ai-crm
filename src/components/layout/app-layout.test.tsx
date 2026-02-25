/**
 * Tests for AppLayout component.
 * @module components/layout/app-layout.test
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "./app-layout";
import { UploadProvider } from "@/contexts/upload-context";

vi.mock("./app-sidebar", () => ({
  AppSidebar: () => <div data-testid="sidebar">Sidebar</div>,
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
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });
});
