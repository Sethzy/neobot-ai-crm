/**
 * Tests global command menu search and selection flows.
 * @module components/__tests__/command-menu
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandMenu } from "@/components/command-menu";

const mockUseSearchRecords = vi.fn();

vi.mock("@/hooks/use-search-records", () => ({
  useSearchRecords: (query: string) => mockUseSearchRecords(query),
}));

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("CommandMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchRecords.mockImplementation((query: string) => ({
      data:
        query.length >= 2
          ? [
              { type: "contact", id: "c1", title: "Sarah Tan", subtitle: "seller" },
              { type: "deal", id: "d1", title: "Bishan St 22", subtitle: "offer" },
              { type: "task", id: "t1", title: "Follow up call", subtitle: "in progress" },
              { type: "thread", id: "th-1", title: "Update phone", subtitle: "" },
            ]
          : [],
      isLoading: false,
      isError: false,
    }));
  });

  it("renders search input when open", () => {
    render(<CommandMenu open onOpenChange={() => {}} />);

    expect(screen.getByPlaceholderText(/search contacts, deals, tasks, threads/i)).toBeInTheDocument();
  });

  it("shows grouped results on search with section headings", async () => {
    const user = userEvent.setup();

    render(<CommandMenu open onOpenChange={() => {}} />);

    await user.type(screen.getByRole("combobox"), "sarah");

    await waitFor(() => {
      expect(screen.getByText("Contacts")).toBeInTheDocument();
      expect(screen.getByText("Deals")).toBeInTheDocument();
      expect(screen.getByText("Tasks")).toBeInTheDocument();
      expect(screen.getByText("Threads")).toBeInTheDocument();
      expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
      expect(screen.getByText("Bishan St 22")).toBeInTheDocument();
      expect(screen.getByText("Follow up call")).toBeInTheDocument();
      expect(screen.getByText("Update phone")).toBeInTheDocument();
    });
  });

  it("navigates to contact drawer route on contact select", async () => {
    const user = userEvent.setup();

    render(<CommandMenu open onOpenChange={() => {}} />);

    await user.type(screen.getByRole("combobox"), "sarah");
    await waitFor(() => expect(screen.getByText("Sarah Tan")).toBeInTheDocument());

    await user.click(screen.getByText("Sarah Tan"));

    expect(mockPush).toHaveBeenCalledWith("/crm/contacts?detail=c1");
  });

  it("navigates to thread route on thread select", async () => {
    const user = userEvent.setup();

    render(<CommandMenu open onOpenChange={() => {}} />);

    await user.type(screen.getByRole("combobox"), "update");
    await waitFor(() => expect(screen.getByText("Update phone")).toBeInTheDocument());

    await user.click(screen.getByText("Update phone"));

    expect(mockPush).toHaveBeenCalledWith("/chat/th-1");
  });

  it("navigates to task drawer route on task select", async () => {
    const user = userEvent.setup();

    render(<CommandMenu open onOpenChange={() => {}} />);

    await user.type(screen.getByRole("combobox"), "follow");
    await waitFor(() => expect(screen.getByText("Follow up call")).toBeInTheDocument());

    await user.click(screen.getByText("Follow up call"));

    expect(mockPush).toHaveBeenCalledWith("/tasks?detail=t1");
  });

  it("clears query when command menu closes and reopens", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<CommandMenu open onOpenChange={onOpenChange} />);

    await user.type(screen.getByRole("combobox"), "sarah");
    await waitFor(() => expect(screen.getByText("Sarah Tan")).toBeInTheDocument());

    rerender(<CommandMenu open={false} onOpenChange={onOpenChange} />);
    rerender(<CommandMenu open onOpenChange={onOpenChange} />);

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByText("Sarah Tan")).not.toBeInTheDocument();
  });

  it("shows an explicit error state when search fails", async () => {
    const user = userEvent.setup();
    mockUseSearchRecords.mockImplementation((query: string) => ({
      data: [],
      isLoading: false,
      isError: query.length >= 2,
    }));

    render(<CommandMenu open onOpenChange={() => {}} />);

    await user.type(screen.getByRole("combobox"), "sarah");

    await waitFor(() => {
      expect(screen.getByText(/unable to search right now/i)).toBeInTheDocument();
    });
  });

  it("does not show stale empty-state text after closing and reopening", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockUseSearchRecords.mockImplementation((query: string) => ({
      data: query.length >= 2 ? [] : [],
      isLoading: false,
      isError: false,
    }));

    const { rerender } = render(<CommandMenu open onOpenChange={onOpenChange} />);

    await user.type(screen.getByRole("combobox"), "zzz");
    await waitFor(() => {
      expect(screen.getByText(/no results for/i)).toBeInTheDocument();
    });

    rerender(<CommandMenu open={false} onOpenChange={onOpenChange} />);
    rerender(<CommandMenu open onOpenChange={onOpenChange} />);

    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByText(/no results for/i)).not.toBeInTheDocument();
  });
});
