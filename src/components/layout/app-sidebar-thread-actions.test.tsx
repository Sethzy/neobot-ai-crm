/**
 * Tests thread rail actions in AppSidebar for mobile behavior.
 * @module components/layout/app-sidebar-thread-actions.test
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";

const mockSetOpenMobile = vi.fn();
const mockCreateThread = vi.fn();
const mockSelectThread = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ push: vi.fn() }),
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

vi.mock("@/contexts/thread-context", () => ({
  useThreads: () => ({
    threads: [
      { id: "thread-1", title: "Thread Alpha", createdAt: new Date("2026-03-01T00:00:00.000Z") },
      { id: "thread-2", title: "Thread Beta", createdAt: new Date("2026-03-01T01:00:00.000Z") },
    ],
    activeThreadId: "thread-1",
    createThread: mockCreateThread,
    selectThread: mockSelectThread,
    updateThreadTitle: vi.fn(),
  }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: React.PropsWithChildren) => <aside>{children}</aside>,
  SidebarContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarMenu: ({ children }: React.PropsWithChildren) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: React.PropsWithChildren) => <li>{children}</li>,
  SidebarMenuButton: ({
    children,
    asChild,
    isActive,
    tooltip: _tooltip,
    ...props
  }: React.PropsWithChildren<{
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string;
  }>) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" data-active={isActive} {...props}>
        {children}
      </button>
    ),
  SidebarGroup: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  SidebarGroupLabel: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  SidebarMenuSub: ({ children }: React.PropsWithChildren) => <ul>{children}</ul>,
  SidebarMenuSubItem: ({ children }: React.PropsWithChildren) => <li>{children}</li>,
  SidebarMenuSubButton: ({
    children,
    isActive,
    href: _href,
    ...props
  }: React.PropsWithChildren<{ isActive?: boolean; href?: string }>) => (
    <button type="button" data-active={isActive} {...props}>
      {children}
    </button>
  ),
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
  });

  it("creates a new thread and closes the mobile sidebar", async () => {
    const user = userEvent.setup();
    render(<AppSidebar />);

    await user.click(screen.getByRole("button", { name: /new chat/i }));

    expect(mockCreateThread).toHaveBeenCalledTimes(1);
    expect(mockSetOpenMobile).toHaveBeenCalledWith(false);
  });

  it("selects a thread and closes the mobile sidebar", async () => {
    const user = userEvent.setup();
    render(<AppSidebar />);

    await user.click(screen.getByRole("button", { name: "Thread Beta" }));

    expect(mockSelectThread).toHaveBeenCalledWith("thread-2");
    expect(mockSetOpenMobile).toHaveBeenCalledWith(false);
  });
});
