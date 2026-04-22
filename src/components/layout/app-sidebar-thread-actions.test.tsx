/**
 * Tests thread rail actions in AppSidebar for mobile behavior.
 * @module components/layout/app-sidebar-thread-actions.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";

const mockSetOpenMobile = vi.fn();
const mockArchiveThread = vi.fn();
const mockPush = vi.fn();
const mockToastError = vi.fn();
let mockPathname = "/chat";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    user: { email: "test@example.com" },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: vi.fn() },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [
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
        title: "Thread Alpha",
        isPinned: false,
        isPrimary: false,
        createdAt: new Date("2026-03-01T01:00:00.000Z"),
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        lastReadAt: null,
        isUnread: true,
        sourceType: "chat",
      },
    ],
    unreadCount: 1,
    isLoading: false,
    updateThreadTitle: vi.fn(),
    archiveThread: mockArchiveThread,
    markRead: vi.fn(),
  }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: React.PropsWithChildren) => <aside>{children}</aside>,
  SidebarContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarMenu: ({ children }: React.PropsWithChildren) => <ul>{children}</ul>,
  SidebarMenuAction: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: React.PropsWithChildren) => <li>{children}</li>,
  SidebarMenuButton: ({
    children,
    asChild,
    isActive,
    tooltip,
    ...props
  }: React.PropsWithChildren<{
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  }>) => {
    void tooltip;
    return asChild ? (
      <div data-active={isActive}>{children}</div>
    ) : (
      <button type="button" data-active={isActive} {...props}>
        {children}
      </button>
    );
  },
  SidebarGroup: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  SidebarGroupLabel: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  SidebarMenuSub: ({ children }: React.PropsWithChildren) => <ul>{children}</ul>,
  SidebarMenuSubItem: ({ children }: React.PropsWithChildren) => <li>{children}</li>,
  SidebarMenuSubButton: ({
    children,
    isActive,
    href,
    ...props
  }: React.PropsWithChildren<{ isActive?: boolean; href?: string }>) => {
    void href;
    return (
      <button type="button" data-active={isActive} {...props}>
        {children}
      </button>
    );
  },
  useSidebar: () => ({
    state: "expanded" as const,
    open: true,
    setOpen: vi.fn(),
    openMobile: true,
    setOpenMobile: mockSetOpenMobile,
    isMobile: true,
    toggleSidebar: vi.fn(),
  }),
}));

describe("AppSidebar mobile thread actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/chat";
    mockArchiveThread.mockResolvedValue(true);
  });

  it("does not render a New Chat button in Chats", () => {
    render(<AppSidebar />);

    expect(screen.queryByRole("button", { name: /new chat/i })).not.toBeInTheDocument();
  });

  it("closes the mobile sidebar on thread link click", async () => {
    const user = userEvent.setup();
    render(<AppSidebar />);

    await user.click(screen.getByRole("link", { name: "Main" }));

    expect(mockSetOpenMobile).toHaveBeenCalledWith(false);
  });

  it("highlights active thread based on URL pathname", () => {
    mockPathname = "/chat/thread-primary";
    render(<AppSidebar />);

    const activeLink = screen.getByRole("link", { name: "Main" });
    const inactiveLink = screen.getByRole("link", { name: "Thread Alpha" });

    expect(activeLink.closest("[data-active]")).toHaveAttribute("data-active", "true");
    expect(inactiveLink.closest("[data-active]")).toHaveAttribute("data-active", "false");
  });

  it("archives the active thread and navigates to the next available thread", async () => {
    const user = userEvent.setup();
    mockPathname = "/chat/thread-1";
    render(<AppSidebar />);

    await user.click(screen.getByRole("button", { name: /more actions for thread alpha/i }));
    await user.click(screen.getByRole("menuitem", { name: /archive/i }));

    expect(mockArchiveThread).toHaveBeenCalledWith("thread-1");
    expect(mockPush).toHaveBeenCalledWith("/chat/thread-primary");
  });

  it("does not render archive actions for pinned threads", async () => {
    render(<AppSidebar />);

    expect(
      screen.queryByRole("button", { name: /more actions for main/i }),
    ).not.toBeInTheDocument();
  });

  it("does not navigate when archiving fails and shows an error toast", async () => {
    const user = userEvent.setup();
    mockPathname = "/chat/thread-1";
    mockArchiveThread.mockRejectedValue(new Error("archive failed"));
    render(<AppSidebar />);

    await user.click(screen.getByRole("button", { name: /more actions for thread alpha/i }));
    await user.click(screen.getByRole("menuitem", { name: /archive/i }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("Failed to archive chat.");
  });
});
