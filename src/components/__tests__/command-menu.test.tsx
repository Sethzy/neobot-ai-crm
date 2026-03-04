/**
 * Tests global command menu search and selection flows.
 * @module components/__tests__/command-menu
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandMenu } from "@/components/command-menu";

vi.mock("@/hooks/use-search-records", () => ({
  useSearchRecords: (query: string) => ({
    data:
      query.length >= 2
        ? [
            { type: "contact", id: "c1", title: "Sarah Tan", subtitle: "seller" },
            { type: "deal", id: "d1", title: "Bishan St 22", subtitle: "offer" },
            { type: "thread", id: "t1", title: "Update phone", subtitle: "" },
          ]
        : [],
    isLoading: false,
  }),
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
  });

  it("renders search input when open", () => {
    render(<CommandMenu open onOpenChange={() => {}} />);

    expect(screen.getByPlaceholderText(/search contacts, deals, tasks, threads/i)).toBeInTheDocument();
  });

  it("shows grouped results on search", async () => {
    const user = userEvent.setup();

    render(<CommandMenu open onOpenChange={() => {}} />);

    await user.type(screen.getByRole("combobox"), "sarah");

    await waitFor(() => {
      expect(screen.getByText("Sarah Tan")).toBeInTheDocument();
      expect(screen.getByText("Bishan St 22")).toBeInTheDocument();
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

    expect(mockPush).toHaveBeenCalledWith("/chat/t1");
  });
});
