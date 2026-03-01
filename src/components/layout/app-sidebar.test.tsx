/**
 * Tests for AppSidebar component.
 * @module components/layout/app-sidebar.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

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

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock use-mobile hook
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [{ id: "thread-1", title: "Test Chat", createdAt: new Date() }],
    activeThreadId: "thread-1",
    createThread: vi.fn(),
    selectThread: vi.fn(),
    updateThreadTitle: vi.fn(),
  }),
}));

/** Wrapper with SidebarProvider */
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider>{children}</SidebarProvider>
);

describe("AppSidebar", () => {
  beforeEach(() => {
    mockPathname = "/chat";
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
    expect(screen.getByText("Documents")).toBeInTheDocument();
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
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Instructions")).not.toBeInTheDocument();
  });

  it("renders chat thread rail on /chat routes", () => {
    render(<AppSidebar />, { wrapper });

    expect(screen.getByText("Test Chat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new chat/i })).toBeInTheDocument();
  });
});
