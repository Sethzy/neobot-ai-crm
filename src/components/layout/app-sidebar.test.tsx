/**
 * Tests for AppSidebar component.
 * @module components/layout/app-sidebar.test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
const mockMarkRead = vi.fn();
let mockThreads = [
  {
    id: "thread-primary",
    title: "Main",
    isPinned: true,
    isPrimary: true,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-22T09:00:00.000Z"),
    lastReadAt: new Date("2026-04-22T09:00:00.000Z"),
    isUnread: false,
    sourceType: "chat",
  },
  {
    id: "thread-1",
    title: "Test Chat",
    isPinned: false,
    isPrimary: false,
    createdAt: new Date("2026-03-01T01:00:00.000Z"),
    updatedAt: new Date("2026-04-22T10:00:00.000Z"),
    lastReadAt: null,
    isUnread: true,
    sourceType: "chat",
  },
];
let mockUnreadCount = 1;

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
    threads: mockThreads,
    unreadCount: mockUnreadCount,
    isLoading: false,
    updateThreadTitle: mockUpdateThreadTitle,
    archiveThread: mockArchiveThread,
    markRead: mockMarkRead,
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
    mockThreads = [
      {
        id: "thread-primary",
        title: "Main",
        isPinned: true,
        isPrimary: true,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-22T09:00:00.000Z"),
        lastReadAt: new Date("2026-04-22T09:00:00.000Z"),
        isUnread: false,
        sourceType: "chat",
      },
      {
        id: "thread-1",
        title: "Test Chat",
        isPinned: false,
        isPrimary: false,
        createdAt: new Date("2026-03-01T01:00:00.000Z"),
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        lastReadAt: null,
        isUnread: true,
        sourceType: "chat",
      },
    ];
    mockUnreadCount = 1;
  });

  it("renders logo", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("neobot")).toBeInTheDocument();
  });

  it("renders AGENT section nav items", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("New Task")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Automations")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /agent/i })).not.toBeInTheDocument();
  });

  it("renders CRM section nav items including Todos and Meetings", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Companies")).toBeInTheDocument();
    expect(screen.getByText("Deals")).toBeInTheDocument();
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("Meetings")).toBeInTheDocument();
    expect(screen.queryByText("Knowledge")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Tasks")).not.toBeInTheDocument();
  });

  it("renders section headers", () => {
    render(<AppSidebar />, { wrapper });
    expect(screen.getAllByText("Agent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("CRM")).toBeInTheDocument();
    expect(screen.getByText("Chats")).toBeInTheDocument();
    expect(screen.queryByText("Database")).not.toBeInTheDocument();
    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
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

  it("renders chats section with thread history", () => {
    render(<AppSidebar />, { wrapper });

    expect(screen.getByText("Chats")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Test Chat")).toBeInTheDocument();
  });

  it("shows the primary thread before regular chats in the sidebar list", () => {
    render(<AppSidebar />, { wrapper });

    const chatLinks = screen.getAllByRole("link").filter((link) =>
      link.getAttribute("href")?.startsWith("/chat/")
    );

    expect(chatLinks[0]).toHaveTextContent("Main");
    expect(chatLinks[1]).toHaveTextContent("Test Chat");
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

  it("does not render a New Chat button in the Chats section", () => {
    render(<AppSidebar />, { wrapper });

    expect(screen.queryByRole("button", { name: /new chat/i })).not.toBeInTheDocument();
  });

  it("renders an unread dot, bold title, and count for unread threads", () => {
    render(<AppSidebar />, { wrapper });

    const unreadLink = screen.getByRole("link", { name: "Test Chat" });
    expect(within(unreadLink).getByTestId("thread-unread-dot")).toBeInTheDocument();
    expect(within(unreadLink).getByText("Test Chat")).toHaveClass("font-semibold");
    expect(screen.getByText("· 1")).toBeInTheDocument();
  });

  it("hides the unread count when there are no unread threads", () => {
    mockThreads = mockThreads.map((thread) => ({ ...thread, isUnread: false }));
    mockUnreadCount = 0;

    render(<AppSidebar />, { wrapper });

    expect(screen.queryByText(/^· /)).not.toBeInTheDocument();
  });

  it("caps the unread count at 9+", () => {
    mockUnreadCount = 12;

    render(<AppSidebar />, { wrapper });

    expect(screen.getByText("· 9+")).toBeInTheDocument();
  });

  it("does not show the unread dot on the active thread row", () => {
    mockPathname = "/chat/thread-1";

    render(<AppSidebar />, { wrapper });

    const activeLink = screen.getByRole("link", { name: "Test Chat" });
    expect(within(activeLink).queryByTestId("thread-unread-dot")).not.toBeInTheDocument();
  });
});
