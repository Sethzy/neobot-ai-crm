/**
 * Tests for AppSidebar component.
 * @module components/layout/app-sidebar.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock useSession hook
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    user: { email: "test@example.com" },
  }),
}));

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: vi.fn() },
  },
}));

// Configurable pathname for router mock
let mockPathname = "/chat";
const mockPush = vi.fn();
const mockUpdateThreadTitle = vi.fn();
const mockArchiveThread = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock use-mobile hook
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [{ id: "thread-1", title: "Test Chat", createdAt: new Date() }],
    updateThreadTitle: mockUpdateThreadTitle,
    archiveThread: mockArchiveThread,
  }),
}));

/** Wrapper with SidebarProvider and TooltipProvider */
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>
    <SidebarProvider>{children}</SidebarProvider>
  </TooltipProvider>
);

describe("AppSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/chat";
    mockArchiveThread.mockResolvedValue(true);
  });

  it("renders logo", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("neobot")).toBeInTheDocument();
  });

  it("renders AGENT section nav items", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Mission Control")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Automations")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
  });

  it("renders DATABASE section nav items", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("CRM")).toBeInTheDocument();
    expect(screen.getByText("Knowledge")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Channels")).toBeInTheDocument();
  });

  it("renders section headers", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
  });

  it("renders Settings in footer", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders user email", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("renders sign out option in user dropdown", async () => {
    render(<AppSidebar />, { wrapper });
    const trigger = screen.getByText("test@example.com");
    await userEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("does not render old nav items", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
    expect(screen.queryByText("Instructions")).not.toBeInTheDocument();
  });

  it("renders sessions section with thread history", () => {
    render(<AppSidebar />, { wrapper });

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Test Chat")).toBeInTheDocument();
  });

  it("hides the search button when command menu callback is not provided", () => {
    render(<AppSidebar />, { wrapper });

    expect(screen.queryByRole("button", { name: /search/i })).not.toBeInTheDocument();
  });

  it("calls onOpenCommandMenu when clicking search button", async () => {
    const user = userEvent.setup();
    const onOpenCommandMenu = vi.fn();
    render(<AppSidebar onOpenCommandMenu={onOpenCommandMenu} />, { wrapper });

    await user.click(screen.getByRole("button", { name: /search/i }));

    expect(onOpenCommandMenu).toHaveBeenCalledTimes(1);
  });

  it("does not render a New Chat button in the Sessions section", () => {
    render(<AppSidebar />, { wrapper });

    expect(screen.queryByRole("button", { name: /new chat/i })).not.toBeInTheDocument();
  });
});
